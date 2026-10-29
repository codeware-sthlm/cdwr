import { existsSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineCommand } from '../../cli/command';
import { CliError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { CommandError, run } from '../../services/shell';

import {
  APP_DIR,
  APP_NAME,
  APP_PATH,
  APP_PROCESS,
  APP_ZIP,
  ARTIFACT,
  PREVIOUS_PATH,
  QUIT_POLL_MS,
  WORKFLOW,
  artifactProblem,
  artifactVerdict,
  chooseRun,
  installSteps,
  installedSummary,
  isMissingXattr,
  noRunProblem,
  parsePrHead,
  parseRuns,
  platformProblem,
  quitFix,
  quitGaveUp,
  quitProblem,
  rebuildFix,
  staleNote
} from './desk-install.logic';
import { REPO } from './worktree.logic';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Whether the app has a process; pgrep exits 1 when none matches */
const isRunning = async (): Promise<boolean> => {
  try {
    await run('pgrep', ['-x', APP_PROCESS]);
    return true;
  } catch (error) {
    if (error instanceof CommandError && error.code === 1) return false;
    throw error;
  }
};

/** Asks a running app to quit and waits for it; fails when it stays up */
const quitApp = async (): Promise<void> => {
  if (!(await isRunning())) return;
  await run('osascript', ['-e', `quit app "${APP_NAME}"`]);
  for (let waited = 0; !quitGaveUp(waited); waited += QUIT_POLL_MS) {
    await sleep(QUIT_POLL_MS);
    if (!(await isRunning())) return;
  }
  throw new CliError(quitProblem, undefined, quitFix);
};

/** Clears the flag Gatekeeper checks; an app without it is already fine */
const clearQuarantine = async (): Promise<void> => {
  try {
    await run('xattr', ['-p', 'com.apple.quarantine', APP_PATH]);
  } catch {
    return;
  }
  try {
    await run('xattr', ['-dr', 'com.apple.quarantine', APP_PATH]);
  } catch (error) {
    if (!(error instanceof CommandError && isMissingXattr(error.stderr))) {
      throw error;
    }
  }
};

export default defineCommand({
  summary: 'Install the Agent Desk from a CI build',
  description: `Installs ${APP_NAME} into ${APP_DIR} from the artifact the desk workflow built: the newest successful push to main, or with --pr the newest successful build of that pull request's branch. Replaces an installed copy, quits it first and clears the quarantine flag; its settings live outside the app and are kept. Does not open the app. macOS arm64 only.`,
  danger: 'mutate',
  needs: ['gh'],
  inputs: {
    pr: input.optional(
      input.number({
        prompt: 'Which pull request?',
        description: 'Install the build of this pull request instead of main',
        short: 'p',
        flagOnly: true
      }),
      () => true
    )
  },

  async plan(_ctx, { pr }) {
    const problem = platformProblem(process.platform, process.arch);
    if (problem) throw new CliError(problem);

    let head;
    if (pr !== undefined) {
      const { stdout } = await run('gh', [
        'pr',
        'view',
        String(pr),
        '-R',
        REPO,
        '--json',
        'headRefName,headRefOid,isCrossRepository'
      ]);
      head = parsePrHead(stdout);
      if (!head) throw new CliError(`Could not read pull request ${pr}`);
    }

    const { stdout: runsJson } = await run('gh', [
      'run',
      'list',
      '-R',
      REPO,
      '--workflow',
      WORKFLOW,
      ...(head ? ['--branch', head.branch] : ['--branch', 'main']),
      '--status',
      'success',
      '--limit',
      '30',
      '--json',
      'databaseId,headSha,headBranch,event,conclusion,createdAt'
    ]);
    const chosen = chooseRun(parseRuns(runsJson), head);
    if (!chosen) {
      throw new CliError(noRunProblem(pr), undefined, rebuildFix(head?.branch));
    }

    const { stdout: artifactsJson } = await run('gh', [
      'api',
      `repos/${REPO}/actions/runs/${chosen.databaseId}/artifacts`
    ]);
    const verdict = artifactVerdict(artifactsJson);
    if (verdict !== 'present') {
      throw new CliError(
        artifactProblem(verdict),
        undefined,
        rebuildFix(head?.branch)
      );
    }

    const replacing = existsSync(APP_PATH);
    const note = staleNote(chosen, head);
    return {
      steps: installSteps(chosen, replacing),
      notes: note ? [note] : undefined,
      data: { runId: chosen.databaseId, sha: chosen.headSha, replacing }
    };
  },

  async apply(ctx, { runId, sha, replacing }) {
    const tmp = mkdtempSync(join(tmpdir(), 'agent-desk-'));
    try {
      await ctx.ui.task('Downloading the build', () =>
        run('gh', [
          'run',
          'download',
          String(runId),
          '-R',
          REPO,
          '-n',
          ARTIFACT,
          '-D',
          tmp
        ])
      );
      const unpacked = join(tmp, 'unpacked');
      await ctx.ui.task('Unpacking', () =>
        run('ditto', ['-x', '-k', join(tmp, APP_ZIP), unpacked])
      );
      const built = join(unpacked, `${APP_NAME}.app`);
      if (!existsSync(built)) {
        throw new CliError(`${APP_ZIP} does not hold ${APP_NAME}.app`);
      }
      if (existsSync(APP_PATH)) await quitApp();
      await ctx.ui.task(`Installing ${APP_PATH}`, async () => {
        // The old app stays beside the new one until the install has worked
        let aside = false;
        if (existsSync(APP_PATH)) {
          rmSync(PREVIOUS_PATH, { recursive: true, force: true });
          renameSync(APP_PATH, PREVIOUS_PATH);
          aside = true;
        }
        try {
          // The temp directory may be on another volume
          try {
            renameSync(built, APP_PATH);
          } catch {
            await run('ditto', [built, APP_PATH]);
          }
          await clearQuarantine();
        } catch (error) {
          rmSync(APP_PATH, { recursive: true, force: true });
          if (aside) renameSync(PREVIOUS_PATH, APP_PATH);
          throw error;
        }
        rmSync(PREVIOUS_PATH, { recursive: true, force: true });
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
    return {
      summary: installedSummary(),
      json: { path: APP_PATH, runId, sha, replaced: replacing }
    };
  }
});
