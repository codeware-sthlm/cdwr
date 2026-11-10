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
  linearAuth,
  paths,
  readClaudeConfig,
  readQueueSources,
  readText,
  requireHost,
  worktreeOf
} from '../../services/agent-queue';
import { childEnv, run, sleep } from '../../services/shell';

import {
  ENV_COPIES,
  KEYCHAIN_CLIENT_ID_SERVICE,
  KEYCHAIN_CLIENT_SECRET_SERVICE,
  QUEUE_BINARIES,
  QUEUE_FILES,
  WORKTREE_PREF,
  attendedLinearServer,
  attendedLinearServerCurrent,
  byFile,
  domainTarget,
  filesDrift,
  installWork,
  launchPath,
  memoryDir,
  renderPlist,
  schedulerHere,
  serviceTarget,
  suggestSettings
} from './agent.logic';

const LEGACY_HOME = join(homedir(), '.claude', 'agent-queue');

const hasLinearServer = (config: unknown): boolean =>
  typeof config === 'object' &&
  config !== null &&
  typeof (config as { mcpServers?: unknown }).mcpServers === 'object' &&
  (config as { mcpServers: Record<string, unknown> | null }).mcpServers !==
    null &&
  'agent_linear' in
    (config as { mcpServers: Record<string, unknown> }).mcpServers;

const expand = (path: string): string =>
  resolve(path.replace(/^~(?=$|\/)/, homedir()));

export default defineCommand({
  summary: 'Set up the agent queue on this Mac; --scheduler adds the planner',
  description:
    'Installs the queue scripts, stores the Linear app client id and secret in the Keychain when they are missing and adds the agent_linear MCP server to your Claude config. With --scheduler, or when a launchd job is already here, it also creates the worktree the queue plans in, copies the env files, installs its dependencies and installs and loads the launchd job. Run it again after the scripts change; it only does what differs.',
  danger: 'mutate',
  needs: ['claude', 'jq', 'gh'],
  inputs: {
    scheduler: input.boolean({
      flag: 'scheduler',
      short: 'S',
      prompt: 'Set up the scheduled planner too?',
      description:
        'Also set up the scheduled planner: its worktree and the launchd job; a Mac that has the job keeps it current without the flag',
      default: false,
      flagOnly: true
    }),
    agentWorktree: input.optional(
      input.string({
        flag: 'worktree',
        prompt: 'Where should the agent worktree live?',
        short: 'w',
        description:
          'Checkout the scheduler plans in; defaults to codeware-agent beside this one, remembered once given',
        flagOnly: true
      }),
      () => true
    )
  },

  async plan(ctx, { scheduler: schedulerFlag, agentWorktree }) {
    requireHost(['launchd'], ctx.env);
    const job = await jobState();
    const queue = paths(ctx.env);
    const here = schedulerHere('launchd', job, existsSync(queue.plist));
    const withScheduler = schedulerFlag || here;
    if (agentWorktree !== undefined && !withScheduler) {
      throw new UsageError(
        '--worktree is where the scheduler plans, and no scheduler is set up here',
        'Add --scheduler to set it up'
      );
    }
    // bootout would kill a session halfway through a plan
    if (withScheduler && job.loaded && job.running) {
      throw new CliError(
        'A planning run is in progress',
        undefined,
        'Install again once `cdwr agent status` shows it finished'
      );
    }

    const worktree = expand(agentWorktree ?? worktreeOf(ctx));
    const sources = readQueueSources(ctx.root);
    if ('missing' in sources) {
      throw new CliError(`${sources.missing} is missing from this checkout`);
    }
    const { source } = sources;

    let plist = '';
    let worktreeExists = false;
    if (withScheduler) {
      const dirs = QUEUE_BINARIES.map((binary) => {
        const dir = locate(binary, ctx.env);
        if (!dir) throw new CliError(`${binary} is not on PATH`);
        return dir;
      });
      plist = renderPlist({
        script: queue.script,
        home: queue.home,
        repo: worktree,
        path: launchPath(dirs),
        memoryDir:
          ctx.env['AGENT_QUEUE_MEMORY_DIR'] || memoryDir(homedir(), ctx.root),
        suggest: suggestSettings(ctx.env)
      });
      worktreeExists = existsSync(worktree);
      if (worktreeExists && !existsSync(join(worktree, '.git'))) {
        throw new CliError(`${worktree} exists and is not a git checkout`);
      }
    }
    const auth = await linearAuth(ctx.env);
    const claudeConfig = readClaudeConfig();
    const work = installWork({
      schedulerHere: here,
      schedulerFlag,
      scripts: filesDrift(
        byFile((file) => readText(queue.files[file])),
        source
      ),
      appCredentials: auth === 'app',
      linearServerCurrent: attendedLinearServerCurrent(
        claudeConfig,
        queue.files['lib.sh']
      ),
      scheduler: {
        worktreeExists,
        envCopies: withScheduler
          ? ENV_COPIES.filter((file) => {
              const ours = readText(join(ctx.root, file));
              return (
                ours !== undefined && ours !== readText(join(worktree, file))
              );
            })
          : [],
        depsInstalled: existsSync(join(worktree, 'node_modules')),
        plistCurrent: readText(queue.plist) === plist,
        jobLoaded: job.loaded,
        jobScriptCurrent: job.loaded && job.script === queue.script
      }
    });

    if (work.credentials && (!ctx.ui.interactive || ctx.flags.nonInteractive)) {
      throw new UsageError(
        `The Linear app's client id and secret are not in the Keychain (services ${KEYCHAIN_CLIENT_ID_SERVICE} and ${KEYCHAIN_CLIENT_SECRET_SERVICE})`,
        'Run `cdwr agent install -i` (or with no arguments) in a terminal to be asked for them'
      );
    }

    const steps = [
      work.worktree && {
        label: 'Create the worktree at origin/main',
        detail: worktree
      },
      ...work.envCopies.map((file) => ({
        label: `Copy ${file}`,
        detail: worktree
      })),
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
      work.credentials && {
        label: "Store the Linear app's client id and secret in the Keychain",
        detail: `services ${KEYCHAIN_CLIENT_ID_SERVICE} and ${KEYCHAIN_CLIENT_SECRET_SERVICE}; you are asked for them`
      },
      work.mcp && {
        label: 'Add the agent_linear MCP server to your Claude config',
        detail: '~/.claude.json, user scope'
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
      legacy: existsSync(LEGACY_HOME),
      mcpExists: hasLinearServer(claudeConfig)
    };
    if (steps.length === 0) {
      return {
        steps,
        nothing: work.scheduler
          ? 'The agent queue and its launchd job are installed and current'
          : 'The attended side is installed and current; no launchd job here (`--scheduler` adds one)',
        data
      };
    }
    return {
      steps,
      notes: [
        work.scheduler
          ? 'The job runs every 10 minutes; `cdwr agent pause` holds it'
          : 'No launchd job is set up here; `--scheduler` adds one'
      ],
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

      if (work.credentials) {
        const clientId = await ctx.ui.password({
          message: "Client id of the queue's Linear app",
          validate: (value) =>
            value.trim() ? undefined : 'Enter the client id'
        });
        const clientSecret = await ctx.ui.password({
          message: "Client secret of the queue's Linear app",
          validate: (value) =>
            value.trim() ? undefined : 'Enter the client secret'
        });
        for (const [service, value] of [
          [KEYCHAIN_CLIENT_ID_SERVICE, clientId],
          [KEYCHAIN_CLIENT_SECRET_SERVICE, clientSecret]
        ] as const) {
          // A failed call's error would carry the value in its argv
          await run('security', [
            'add-generic-password',
            '-U',
            '-s',
            service,
            '-a',
            userInfo().username,
            '-w',
            value.trim()
          ]).catch(() => {
            throw new CliError(
              "Could not store the Linear app's credentials in the Keychain",
              undefined,
              `Store them by hand: security add-generic-password -U -s ${KEYCHAIN_CLIENT_ID_SERVICE} -a "$USER" -w, and the same with -s ${KEYCHAIN_CLIENT_SECRET_SERVICE}`
            );
          });
        }
        ctx.ui.success('Linear app credentials stored in the Keychain');
      }

      if (work.mcp) {
        if (data.mcpExists) {
          await run('claude', [
            'mcp',
            'remove',
            '--scope',
            'user',
            'agent_linear'
          ]).catch(() => undefined);
        }
        await run('claude', [
          'mcp',
          'add-json',
          '--scope',
          'user',
          'agent_linear',
          JSON.stringify(attendedLinearServer(queue.files['lib.sh']))
        ]);
        ctx.ui.success('Added the agent_linear MCP server to ~/.claude.json');
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
      summary: work.scheduler
        ? 'The agent queue and its launchd job are installed'
        : 'The attended side of the agent queue is installed',
      next,
      json: { worktree, script: queue.script, plist: queue.plist, work }
    };
  }
});
