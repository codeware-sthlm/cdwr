import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmdirSync,
  writeFileSync
} from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { defineCommand } from '../../cli/command';
import { CliError, UsageError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { locate } from '../../cli/preflight';
import {
  currentUid,
  jobState,
  keyPresent,
  paths,
  readQueueSources,
  readText,
  requireMac,
  worktreeOf
} from '../../services/agent-queue';
import { childEnv, run, sleep } from '../../services/shell';

import {
  KEYCHAIN_SERVICE,
  QUEUE_FILES,
  WORKTREE_PREF,
  byFile,
  domainTarget,
  filesDrift,
  launchPath,
  renderPlist,
  serviceTarget
} from './agent.logic';

/** Files the worktree needs but git does not carry */
const ENV_COPIES = ['apps/cms/.env.local', 'tools/cdwr/.env'];
/** What the queue script calls; their directories make up the job's PATH */
const BINARIES = ['node', 'claude', 'jq', 'git', 'gh'];
const LEGACY_HOME = join(homedir(), '.claude', 'agent-queue');

const expand = (path: string): string =>
  resolve(path.replace(/^~(?=$|\/)/, homedir()));

export default defineCommand({
  summary: 'Set up the scheduled planner on this machine',
  description:
    'Creates the worktree the queue plans in, copies the env files and installs its dependencies, installs the queue scripts and the launchd job, and stores the Linear key in the Keychain when it is missing. Run it again after the scripts change; it only does what differs.',
  danger: 'mutate',
  needs: ['claude', 'jq', 'gh'],
  inputs: {
    agentWorktree: input.optional(
      input.string({
        flag: 'worktree',
        prompt: 'Where should the agent worktree live?',
        description:
          'Checkout the queue plans in; defaults to codeware-agent beside this one, remembered once given',
        flagOnly: true
      }),
      () => true
    )
  },

  async plan(ctx, { agentWorktree }) {
    requireMac();
    const job = await jobState();
    // bootout would kill a session halfway through a plan
    if (job.loaded && job.running) {
      throw new CliError(
        'A planning run is in progress',
        undefined,
        'Install again once `cdwr agent status` shows it finished'
      );
    }

    const queue = paths(ctx.env);
    const worktree = expand(agentWorktree ?? worktreeOf(ctx));
    const sources = readQueueSources(ctx.root);
    if ('missing' in sources) {
      throw new CliError(`${sources.missing} is missing from this checkout`);
    }
    const { source } = sources;

    const dirs = BINARIES.map((binary) => {
      const dir = locate(binary, ctx.env);
      if (!dir) throw new CliError(`${binary} is not on PATH`);
      return dir;
    });
    const plist = renderPlist({
      script: queue.script,
      home: queue.home,
      repo: worktree,
      path: launchPath(dirs)
    });

    const worktreeExists = existsSync(worktree);
    if (worktreeExists && !existsSync(join(worktree, '.git'))) {
      throw new CliError(`${worktree} exists and is not a git checkout`);
    }
    const envCopies = ENV_COPIES.filter((file) => {
      const ours = readText(join(ctx.root, file));
      return ours !== undefined && ours !== readText(join(worktree, file));
    });
    const work = {
      worktree: !worktreeExists,
      envCopies,
      deps: !existsSync(join(worktree, 'node_modules')),
      script:
        filesDrift(
          byFile((file) => readText(queue.files[file])),
          source
        ) !== 'current',
      plist: readText(queue.plist) !== plist,
      reload: false,
      key: !(await keyPresent())
    };
    work.reload = work.plist || !job.loaded || job.script !== queue.script;

    if (work.key && (!ctx.ui.interactive || ctx.flags.nonInteractive)) {
      throw new UsageError(
        `The Linear API key is not in the Keychain (service ${KEYCHAIN_SERVICE})`,
        'Run `cdwr agent install` in a terminal to be asked for it'
      );
    }

    const steps = [
      work.worktree && {
        label: 'Create the worktree at origin/main',
        detail: worktree
      },
      ...envCopies.map((file) => ({ label: `Copy ${file}`, detail: worktree })),
      work.deps && { label: 'Install dependencies', detail: 'pnpm install' },
      work.script && {
        label: 'Install the queue scripts',
        detail: QUEUE_FILES.join(', ')
      },
      work.plist && { label: 'Write the launchd job', detail: queue.plist },
      work.reload && {
        label: job.loaded ? 'Reload the launchd job' : 'Load the launchd job',
        detail: serviceTarget(currentUid())
      },
      work.key && {
        label: 'Store the Linear API key in the Keychain',
        detail: `service ${KEYCHAIN_SERVICE}; you are asked for it`
      }
    ].filter((step) => step !== false);

    const data = {
      root: ctx.root,
      worktree,
      remember: agentWorktree === undefined ? undefined : worktree,
      queue,
      source,
      plist,
      work,
      wasLoaded: job.loaded,
      legacy: existsSync(LEGACY_HOME)
    };
    if (steps.length === 0) {
      return {
        steps,
        nothing: 'The agent queue is installed and current',
        data
      };
    }
    return {
      steps,
      notes: ['The job runs every hour; `cdwr agent pause` holds it'],
      data
    };
  },

  async apply(ctx, data) {
    const { queue, work, worktree } = data;
    const uid = currentUid();

    // The runner's own lock: a scheduled run can't start mid-install, and bootout can't kill one
    mkdirSync(queue.home, { recursive: true });
    try {
      mkdirSync(queue.lock);
    } catch {
      throw new CliError(
        'A planning run or a check holds the queue lock',
        undefined,
        'Try again once `cdwr agent status` shows no run in progress'
      );
    }
    try {
      if (work.worktree) {
        await ctx.ui.task('Creating the worktree', async () => {
          await run('git', ['fetch', '-q', 'origin'], { cwd: data.root });
          await run(
            'git',
            ['worktree', 'add', '--detach', worktree, 'origin/main'],
            { cwd: data.root }
          );
        });
      }
      for (const file of work.envCopies) {
        mkdirSync(dirname(join(worktree, file)), { recursive: true });
        copyFileSync(join(data.root, file), join(worktree, file));
        ctx.ui.info(`Copied ${file}`);
      }
      if (work.deps) {
        await ctx.ui.task('Installing dependencies in the worktree', () =>
          run('pnpm', ['install', '--frozen-lockfile'], {
            cwd: worktree,
            env: childEnv(ctx.env),
            timeout: 15 * 60_000
          })
        );
      }

      mkdirSync(queue.logs, { recursive: true });
      if (work.script) {
        for (const file of QUEUE_FILES) {
          // A rename swaps the file whole, never one zsh is reading halfway
          const target = queue.files[file];
          const next = `${target}.next`;
          writeFileSync(next, data.source[file]);
          chmodSync(next, 0o755);
          renameSync(next, target);
          ctx.ui.info(`Installed ${target}`);
        }
      }
      if (work.plist) {
        mkdirSync(dirname(queue.plist), { recursive: true });
        writeFileSync(queue.plist, data.plist);
        ctx.ui.info(`Wrote ${queue.plist}`);
      }

      if (work.key) {
        const key = await ctx.ui.password({
          message: 'Linear API key for the agent queue',
          validate: (value) => (value.trim() ? undefined : 'Enter the key')
        });
        // A failed call's error would carry the key in its argv
        await run('security', [
          'add-generic-password',
          '-U',
          '-s',
          KEYCHAIN_SERVICE,
          '-a',
          userInfo().username,
          '-w',
          key.trim()
        ]).catch(() => {
          throw new CliError(
            'Could not store the Linear key in the Keychain',
            undefined,
            `Store it by hand: security add-generic-password -U -s ${KEYCHAIN_SERVICE} -a "$USER" -w`
          );
        });
        ctx.ui.success('Linear key stored in the Keychain');
      }

      if (work.reload) {
        if (data.wasLoaded) {
          await run('launchctl', ['bootout', serviceTarget(uid)]).catch(
            () => undefined
          );
        }
        // bootout returns before launchd lets go of the label
        for (let attempt = 1; ; attempt++) {
          try {
            await run('launchctl', [
              'bootstrap',
              domainTarget(uid),
              queue.plist
            ]);
            break;
          } catch (error) {
            if (attempt === 5) throw error;
            await sleep(500);
          }
        }
        ctx.ui.success(`Loaded ${serviceTarget(uid)}`);
      }
    } finally {
      rmdirSync(queue.lock);
    }

    if (data.remember) ctx.prefs.set(WORKTREE_PREF, data.remember);

    const next = ['`cdwr agent status` shows what the next run would do'];
    if (data.legacy) {
      next.push(
        `${LEGACY_HOME} is no longer used; remove it once the status looks right`
      );
    }
    return {
      summary: 'The agent queue is installed',
      next,
      json: { worktree, script: queue.script, plist: queue.plist, work }
    };
  }
});
