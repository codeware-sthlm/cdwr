import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { defineCommand } from '../../cli/command';
import { CliError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { run } from '../../services/shell';
import { releaseGroupApps } from '../fly/deploy.logic';

import { parseApplyList, validateItem } from './apply-list.logic';

const FUNCTIONS = 'tools/cdwr/agent-queue/supabase/functions';

export default defineCommand({
  summary: 'Check the apply list in a PR-ready comment',
  description:
    'Reads a comment body file, parses its apply list and checks every open item against the closed vocabulary. Exits 1 naming the first item that is invalid; a body with no apply list is ok with no items.',
  danger: 'read',
  history: false,
  inputs: {
    body: input.string({
      prompt: 'Which comment body file?',
      short: 'b',
      description: 'A file holding the comment body',
      flagOnly: true
    })
  },

  async plan(ctx, { body }) {
    const text = (() => {
      try {
        return readFileSync(resolve(ctx.root, body), 'utf8');
      } catch (error) {
        throw new CliError(`failed: ${body}: ${(error as Error).message}`);
      }
    })();
    const items = parseApplyList(text);
    const apps = releaseGroupApps(
      JSON.parse(readFileSync(join(ctx.root, 'nx.json'), 'utf8'))
    );
    const addedFiles = items.some((item) => item.kind === 'supabase-migration')
      ? (
          await run(
            'git',
            ['diff', '--name-only', '--diff-filter=A', 'origin/main...HEAD'],
            { cwd: ctx.root }
          )
        ).stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== '')
      : [];
    const checked = items.map((item) => ({
      spec: item.spec,
      kind: item.kind,
      args: item.args,
      afterDeploy: item.afterDeploy,
      why: validateItem(item, {
        apps,
        addedFiles,
        functionExists: (name) =>
          statSync(join(ctx.root, FUNCTIONS, name), {
            throwIfNoEntry: false
          })?.isDirectory() === true
      })
    }));
    const bad = checked.find((item) => item.why !== null);
    if (bad) throw new CliError(`apply list item "${bad.spec}": ${bad.why}`);
    return { steps: [], data: { ok: true, items: checked } };
  },

  async apply(_ctx, data) {
    return {
      summary: `${data.items.length} apply list items, all valid`,
      json: data
    };
  }
});
