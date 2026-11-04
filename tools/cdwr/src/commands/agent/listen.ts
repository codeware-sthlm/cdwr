import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { defineCommand } from '../../cli/command';
import { CliError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { paths, requireHost } from '../../services/agent-queue';

import {
  BEAT_MS,
  type ChannelStatus,
  type ListenerState,
  WATCHED,
  createListener
} from './listen.logic';

const URL_ENV = 'AGENT_SUPABASE_URL';
const KEY_ENV = 'AGENT_SUPABASE_ANON_KEY';

export default defineCommand({
  summary:
    'Wake the scheduler when issue or GitHub events or desk commands arrive',
  description: `Subscribes to Supabase Realtime changes on issue_events and github_events, and new rows in desk_commands, and sends SIGUSR1 to the given pid, debounced and at most once a minute. It only wakes the scheduler; it decides nothing. Needs ${URL_ENV} and ${KEY_ENV} (the publishable key, never the service key). Writes listener.json in the queue home, or the file given by --state-file, and exits 1 when it cannot recover, so a supervisor restarts it. Started by the container's loop (apps/agent-host/entrypoint.sh) and by an attended session's wait.sh, which passes --state-file so its state never lands in the queue home's listener.json.`,
  danger: 'read',
  history: false,
  inputs: {
    notifyPid: input.number({
      prompt: 'Which pid should be woken?',
      flag: 'notify-pid',
      short: 'P',
      description: 'The process that receives SIGUSR1 on a wake',
      schema: z.number().int().positive()
    }),
    stateFile: input.string({
      prompt: 'Where should the listener write its state?',
      flag: 'state-file',
      short: 's',
      description:
        'The state file the listener keeps; listener.json in the queue home by default',
      optional: true,
      flagOnly: true
    })
  },

  async plan(ctx, { notifyPid, stateFile }) {
    requireHost(['container', 'launchd'], ctx.env);
    const url = ctx.env[URL_ENV];
    const key = ctx.env[KEY_ENV];
    if (!url) throw new CliError(`${URL_ENV} is not set`);
    if (!key) throw new CliError(`${KEY_ENV} is not set`);
    return {
      steps: [
        `Listen on issue_events, github_events and desk_commands, wake ${notifyPid}`
      ],
      data: {
        url,
        key,
        stateFile: stateFile
          ? resolve(stateFile)
          : join(paths(ctx.env).home, 'listener.json')
      }
    };
  },

  async apply(_ctx, { url, key, stateFile }, { notifyPid }) {
    mkdirSync(join(stateFile, '..'), { recursive: true });
    const persist = (state: ListenerState): void => {
      const tmp = `${stateFile}.tmp`;
      writeFileSync(tmp, JSON.stringify(state));
      renameSync(tmp, stateFile);
    };

    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    let channel = client.channel('agent-listener');

    return new Promise((resolve) => {
      const finish = (code: number): void => {
        clearInterval(beat);
        void client.removeChannel(channel).finally(() => process.exit(code));
      };
      const listener = createListener({
        pid: process.pid,
        now: () => new Date(),
        wake: () => {
          try {
            process.kill(notifyPid, 'SIGUSR1');
            return true;
          } catch {
            // Gone, or no longer ours (EPERM): either way nothing is left to wake
            return false;
          }
        },
        persist,
        log: (line) => console.log(`${new Date().toISOString()} ${line}`),
        fail: () => finish(1)
      });

      for (const { table, events, filter } of WATCHED) {
        for (const event of events) {
          channel = channel.on(
            'postgres_changes',
            { event, schema: 'public', table, ...(filter ? { filter } : {}) },
            () => listener.event()
          );
        }
      }
      const beat = setInterval(listener.beat, BEAT_MS);
      persist(listener.state());
      channel.subscribe((status: string) => {
        if (
          status === 'SUBSCRIBED' ||
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          listener.status(status as ChannelStatus);
        }
      });

      const shutdown = (): void => {
        listener.stop();
        finish(0);
      };
      process.once('SIGTERM', shutdown);
      process.once('SIGINT', shutdown);
      void resolve;
    });
  }
});
