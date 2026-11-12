import { rename, writeFile } from 'node:fs/promises';

import { defineCommand } from '../../cli/command';
import { input } from '../../cli/inputs';
import { paths } from '../../services/agent-queue';

import {
  cmsCredentials,
  coveredPath,
  deviceIdIn,
  readCovered
} from './devlog.io';
import {
  type CoveredRow,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
  accessUrl,
  assertCanDraft,
  outcomeOf,
  readUrl,
  requestHeaders,
  serializeCovered
} from './devlog.logic';

interface Data {
  home: string;
  rows: CoveredRow[];
  check: boolean;
}

export default defineCommand<{ check: ReturnType<typeof input.boolean> }, Data>(
  {
    summary: 'Which drafted posts were published, kept or deleted',
    description:
      'Lists the posts the agent drafted with the pull requests each covers. Unless --no-check is given, every post is read back from the cms first and its outcome (draft, published, deleted) is written to devlog-covered.jsonl in the agent queue home; if any read fails, the command fails and the file is left as it was. Needs CMS_URL and CMS_AGENT_API_KEY, and CMS_SIGNATURE_SECRET when the cms runs in host mode.',
    // Rewrites only the agent's own bookkeeping file, never the cms
    danger: 'read',
    inputs: {
      // Argument parsing allows negation, so `--no-check` turns this off
      check: input.boolean({
        prompt: 'Read the posts back from the cms?',
        short: 'c',
        description:
          'Read each post back first; --no-check lists the file as is',
        default: true,
        flagOnly: true
      })
    },

    async plan(ctx, { check }) {
      const home = paths(ctx.env).home;
      const rows = await readCovered(home);
      return {
        steps: [],
        data: { home, rows, check: check && rows.length > 0 }
      };
    },

    async apply(ctx, { home, rows, check }) {
      let list = rows;
      if (check) {
        const { cmsUrl, key, signatureSecret } = cmsCredentials(ctx.env);
        const deviceId = await deviceIdIn(home);
        // Signed afresh per request: each signature carries its own request id
        const init = () => ({
          headers: requestHeaders({
            key,
            signatureSecret,
            deviceId,
            userAgent: USER_AGENT
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        const access = await fetch(accessUrl(cmsUrl), init());
        assertCanDraft(
          access.status,
          access.status === 200 ? await access.json() : null
        );

        const checkedAt = new Date().toISOString();
        const next: CoveredRow[] = await Promise.all(
          rows.map(async (row) => {
            const response = await fetch(readUrl(cmsUrl, row.postId), init());
            const body = response.status === 200 ? await response.json() : null;
            return {
              ...row,
              outcome: outcomeOf(response.status, body),
              checkedAt
            };
          })
        );
        // Whole file or nothing: a read that threw above never reaches here
        const file = coveredPath(home);
        await writeFile(`${file}.tmp`, serializeCovered(next));
        await rename(`${file}.tmp`, file);
        list = next;
      }

      if (list.length === 0) {
        ctx.ui.info('No drafted posts yet');
      } else {
        ctx.ui.table(
          ['Post', 'Outcome', 'PRs', 'Title', 'At'],
          list.map((row) => [
            String(row.postId),
            row.outcome ?? '-',
            row.prs.map((n) => `#${n}`).join(' '),
            row.title,
            row.at
          ])
        );
      }
      return { summary: `${list.length} drafted post(s)`, json: list };
    }
  }
);
