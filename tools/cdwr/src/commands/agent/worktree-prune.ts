import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineCommand } from '../../cli/command';
import { worktreeOf } from '../../services/agent-queue';
import { run } from '../../services/shell';

import {
  REPO,
  isTicketWorktree,
  parsePrState,
  parseWorktreeList,
  pruneVerdict
} from './worktree.logic';

export default defineCommand({
  summary: 'Remove the checkouts of tickets whose pull request is done',
  description:
    'Looks at the codeware-cod-<n> worktrees beside this checkout. Removes one whose pull request is merged or closed and whose tree is clean, and deletes its local branch when merged. Keeps one with no pull request, an open one, or uncommitted changes. Never touches the agent worktree or the one you run it from.',
  danger: 'mutate',
  needs: ['gh'],
  inputs: {},

  async plan(ctx) {
    const { stdout } = await run('git', ['worktree', 'list', '--porcelain'], {
      cwd: ctx.root
    });
    const skip = [resolve(ctx.root), resolve(worktreeOf(ctx))];
    const found = parseWorktreeList(stdout).filter(
      (entry) =>
        isTicketWorktree(entry.path) && !skip.includes(resolve(entry.path))
    );

    const verdicts = await Promise.all(
      found.map(async ({ path, branch }) => {
        const pr = branch
          ? parsePrState(
              (
                await run(
                  'gh',
                  [
                    'pr',
                    'list',
                    '--repo',
                    REPO,
                    '--head',
                    branch,
                    '--state',
                    'all',
                    '--json',
                    'number,state',
                    '--limit',
                    '1'
                  ],
                  { cwd: ctx.root }
                )
              ).stdout
            )
          : undefined;
        const missing = !existsSync(path);
        const dirty =
          !missing &&
          (
            await run('git', ['-C', path, 'status', '--porcelain'])
          ).stdout.trim() !== '';
        const verdict = pruneVerdict({ path, branch, pr, missing, dirty });
        return { path, branch, verdict };
      })
    );

    const steps = verdicts.map(({ path, branch, verdict }) => ({
      label:
        verdict.action === 'remove'
          ? `Remove ${path}${verdict.deleteBranch ? ' and its branch' : ''}`
          : `Keep ${path}`,
      detail: `${branch ?? 'no branch'}: ${verdict.reason}`
    }));
    const removals = verdicts.flatMap(({ path, branch, verdict }) =>
      verdict.action === 'remove'
        ? [{ path, branch, deleteBranch: verdict.deleteBranch }]
        : []
    );
    const kept = verdicts.length - removals.length;

    if (verdicts.length === 0) {
      return {
        steps,
        nothing: 'No ticket worktrees to look at',
        data: { root: ctx.root, removals, kept }
      };
    }
    if (removals.length === 0) {
      return {
        steps,
        nothing: 'Nothing to remove',
        data: { root: ctx.root, removals, kept }
      };
    }
    return { steps, data: { root: ctx.root, removals, kept } };
  },

  async apply(ctx, { root, removals, kept }) {
    for (const { path, branch, deleteBranch } of removals) {
      await ctx.ui.task(`Removing ${path}`, async () => {
        await run('git', ['worktree', 'remove', path], { cwd: root });
        if (deleteBranch && branch) {
          await run('git', ['branch', '-D', branch], { cwd: root });
        }
      });
    }
    return {
      summary: `Removed ${removals.length} worktree${removals.length === 1 ? '' : 's'}, kept ${kept}`,
      json: { removed: removals, kept }
    };
  }
});
