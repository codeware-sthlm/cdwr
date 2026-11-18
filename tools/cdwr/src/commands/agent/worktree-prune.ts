import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { defineCommand } from '../../cli/command';
import { worktreeOf } from '../../services/agent-queue';
import { run } from '../../services/shell';

import {
  REPO,
  isTicketWorktree,
  orphanDaemons,
  parsePrHead,
  parsePrState,
  parseWorktreeList,
  pruneVerdict
} from './worktree.logic';

/** Nx processes of ticket checkouts that no longer exist; none when `ps` fails */
async function findOrphans(root: string, existing: string[]) {
  try {
    const { stdout } = await run('ps', ['-eo', 'pid=,args=']);
    return orphanDaemons(stdout, existing, dirname(root));
  } catch {
    return [];
  }
}

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
    const entries = parseWorktreeList(stdout);
    const found = entries.filter(
      (entry) =>
        isTicketWorktree(entry.path) && !skip.includes(resolve(entry.path))
    );

    const verdicts = await Promise.all(
      found.map(async ({ path, branch }) => {
        const prJson = branch
          ? (
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
                  'number,state,headRefOid',
                  '--limit',
                  '1'
                ],
                { cwd: ctx.root }
              )
            ).stdout
          : undefined;
        const pr = prJson === undefined ? undefined : parsePrState(prJson);
        const prHead = prJson === undefined ? undefined : parsePrHead(prJson);
        const tip = branch
          ? (
              await run('git', ['rev-parse', `refs/heads/${branch}`], {
                cwd: ctx.root
              })
            ).stdout.trim()
          : undefined;
        const missing = !existsSync(path);
        const dirty =
          !missing &&
          (
            await run('git', ['-C', path, 'status', '--porcelain'])
          ).stdout.trim() !== '';
        const verdict = pruneVerdict({
          path,
          branch,
          pr,
          missing,
          dirty,
          tipIsPrHead: tip !== undefined && tip === prHead
        });
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

    // Daemons whose worktree is gone, or goes with the removals below
    const removed = removals.map(({ path }) => resolve(path));
    const orphans = await findOrphans(
      ctx.root,
      entries
        .map(({ path }) => path)
        .filter((p) => !removed.includes(resolve(p)))
    );
    if (removals.length > 0 || orphans.length > 0) {
      steps.push({
        label:
          'Stop the Nx daemon of each removed worktree, and orphan daemons whose worktree is gone',
        detail:
          orphans.length === 0
            ? 'no orphan daemons found now'
            : orphans.map(({ pid, path }) => `${pid} (${path})`).join(', ')
      });
    }
    const data = { root: ctx.root, removals, kept, orphans };

    if (verdicts.length === 0 && orphans.length === 0) {
      return { steps, nothing: 'No ticket worktrees to look at', data };
    }
    if (removals.length === 0 && orphans.length === 0) {
      return { steps, nothing: 'Nothing to remove', data };
    }
    return { steps, data };
  },

  async apply(ctx, { root, removals, kept }) {
    for (const { path, branch, deleteBranch } of removals) {
      await ctx.ui.task(`Removing ${path}`, async () => {
        try {
          await run('pnpm', ['-C', path, 'exec', 'nx', 'daemon', '--stop']);
        } catch (error) {
          ctx.ui.warn(
            `Could not stop the Nx daemon in ${path}: ${error instanceof Error ? error.message.trim() : String(error)}`
          );
        }
        await run('git', ['worktree', 'remove', path], { cwd: root });
        if (deleteBranch && branch) {
          // The tip is the PR's head, which GitHub keeps, so -D loses nothing
          await run('git', ['branch', '-D', branch], { cwd: root });
        }
      });
    }

    // Looked up again: the removals above changed what exists
    const { stdout } = await run('git', ['worktree', 'list', '--porcelain'], {
      cwd: root
    });
    const orphans = await findOrphans(
      root,
      parseWorktreeList(stdout).map(({ path }) => path)
    );
    const stopped: typeof orphans = [];
    for (const orphan of orphans) {
      try {
        process.kill(orphan.pid, 'SIGTERM');
        stopped.push(orphan);
      } catch (error) {
        ctx.ui.warn(
          `Could not stop process ${orphan.pid} of ${orphan.path}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    return {
      summary: `Removed ${removals.length} worktree${removals.length === 1 ? '' : 's'}, kept ${kept}, stopped ${stopped.length} orphan Nx process${stopped.length === 1 ? '' : 'es'}`,
      json: { removed: removals, kept, stopped }
    };
  }
});
