import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import { defineCommand } from '../../cli/command';
import {
  backupName,
  backupsRoot,
  dumpCms,
  pruneBackups
} from '../../services/backups';

import { oneLine } from './platform.logic';

export const BACKUP_URL_ENV = 'PLATFORM_BACKUP_DATABASE_URL';
export const HOME_ENV = 'AGENT_QUEUE_HOME';
export const STATUS_FILE = 'backup-status.json';
/** Backups kept under the queue's home; older ones go after a good dump */
export const KEEP = 7;

interface Data {
  url: string;
  home: string;
  dir: string;
  name: string;
}

export default defineCommand({
  summary: 'Dump the production CMS database into the agent-queue home',
  description: `Reads ${BACKUP_URL_ENV} (a postgres:// url for a role that can read the payload schema) and ${HOME_ENV}, and writes schema.sql and data.sql of the payload schema with pg_dump into a timestamped folder under backups/ in ${HOME_ENV}. The url reaches pg_dump through libpq's PG* environment variables, never its arguments. After a good dump all but the newest ${KEEP} backups are deleted; a failed dump removes its own partial folder and prunes nothing. The outcome, with no url in it, is written to ${STATUS_FILE} in ${HOME_ENV} for the platform record. Without the variables it does nothing.`,
  danger: 'mutate',
  // The scheduler runs it on a timer
  history: false,
  inputs: {},

  async plan(ctx) {
    const url = ctx.env[BACKUP_URL_ENV];
    const home = ctx.env[HOME_ENV];
    if (!url || !home) {
      const missing = [BACKUP_URL_ENV, HOME_ENV].filter(
        (name) => !ctx.env[name]
      );
      return {
        steps: [],
        nothing: `${missing.join(', ')} not set; no backup taken`,
        data: { url: '', home: '', dir: '', name: '' } satisfies Data
      };
    }
    const name = backupName('cms', 'production');
    const dir = join(backupsRoot(home), name);
    return {
      steps: [
        `Dump the payload schema to backups/${name}/schema.sql`,
        `Dump the payload data to backups/${name}/data.sql`,
        `Keep the newest ${KEEP} backups`,
        `Write ${STATUS_FILE}`
      ],
      data: { url, home, dir, name }
    };
  },

  async apply(_ctx, { url, home, dir, name }) {
    const status = join(home, STATUS_FILE);
    const write = (body: {
      ok: boolean;
      name: string | null;
      bytes: number | null;
      error: string | null;
    }) => {
      mkdirSync(home, { recursive: true });
      writeFileSync(
        status,
        `${JSON.stringify({ at: new Date().toISOString(), ...body })}\n`,
        { mode: 0o600 }
      );
      // The mode of writeFileSync only counts for a file it creates
      chmodSync(status, 0o600);
    };

    // The dump takes its real name only once complete: a run the scheduler's deadline kills
    // leaves a folder that never parses as a backup, and the next run clears it
    const root = backupsRoot(home);
    const partial = join(root, `.${name}.partial`);
    if (existsSync(root)) {
      for (const entry of readdirSync(root)) {
        if (/^\.cms-.*\.partial$/.test(entry)) {
          rmSync(join(root, entry), { recursive: true, force: true });
        }
      }
    }
    let bytes: number;
    try {
      await dumpCms({ url, dir: partial, schema: 'payload' });
      bytes =
        statSync(join(partial, 'schema.sql')).size +
        statSync(join(partial, 'data.sql')).size;
      renameSync(partial, dir);
    } catch (error) {
      // Only this run's folder; nothing is pruned after a failure
      rmSync(partial, { recursive: true, force: true });
      const message = oneLine(error);
      write({ ok: false, name: null, bytes: null, error: message });
      throw new Error(message);
    }
    write({ ok: true, name, bytes, error: null });
    const removed = pruneBackups(home, KEEP);
    return {
      summary: `Backup ${name} written, ${removed.length} old removed`,
      json: { name, bytes, removed }
    };
  }
});
