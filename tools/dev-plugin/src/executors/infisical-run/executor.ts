import { spawn } from 'node:child_process';
import { relative, resolve } from 'node:path';

import {
  InfisicalMissingError,
  deployEnvironment,
  describeLayers,
  fetchVault,
  layerVault,
  offlineCacheFile,
  readCommittedEnv,
  readOfflineCache,
  secretsMode,
  taskEnvFiles
} from '@codeware/shared/util/infisical-cli';
import type { ExecutorContext } from '@nx/devkit';

import { killTree } from './process-tree';
import type { InfisicalRunExecutorSchema } from './schema';

type Env = Record<string, string | undefined>;

/** Runs one command, forwarding stop signals; resolves true when it ended well, false when it failed or was stopped */
const runCommand = (command: string, cwd: string, env: Env): Promise<boolean> =>
  new Promise((resolvePromise) => {
    const child = spawn(command, { shell: true, stdio: 'inherit', cwd, env });
    let stopped = false;

    const forward = (signal: NodeJS.Signals) => () => {
      stopped = true;
      // The shell is not the only process to stop; its children can hold ports
      if (child.pid !== undefined) killTree(child.pid, signal);
      else child.kill(signal);
    };
    const onInt = forward('SIGINT');
    const onTerm = forward('SIGTERM');
    process.on('SIGINT', onInt);
    process.on('SIGTERM', onTerm);

    const done = (ok: boolean) => {
      process.off('SIGINT', onInt);
      process.off('SIGTERM', onTerm);
      resolvePromise(ok);
    };

    child.on('error', (error) => {
      console.error(`infisical-run: ${error.message}`);
      done(false);
    });
    child.on('exit', (code, signal) => {
      // A stop ends the sequence, however the child took it
      done(!stopped && !signal && code === 0);
    });
  });

const runAll = async (
  commands: string[],
  cwd: string,
  env: Env
): Promise<{ success: boolean }> => {
  for (const command of commands) {
    if (!(await runCommand(command, cwd, env))) return { success: false };
  }
  return { success: true };
};

/** The parent target of an atomized target, which Nx also loads env files for */
const nonAtomizedTarget = (
  context: ExecutorContext,
  target: string
): string | undefined => {
  const project =
    context.projectName !== undefined
      ? context.projectsConfigurations?.projects[context.projectName]
      : undefined;
  return project?.targets?.[target]?.metadata?.nonAtomizedTarget;
};

export default async function infisicalRun(
  options: InfisicalRunExecutorSchema,
  context: ExecutorContext
): Promise<{ success: boolean }> {
  const projectRoot =
    context.projectName !== undefined
      ? context.projectsConfigurations?.projects[context.projectName]?.root
      : undefined;
  const cwd = resolve(context.root, options.cwd ?? projectRoot ?? '.');

  const inherited: Env = { ...process.env, ...options.env };
  const mode = secretsMode(inherited);

  if (mode === 'ci') {
    console.log('[SECRETS] CI — using the environment the workflow provides');
    return runAll(options.commands, cwd, inherited);
  }

  const target = context.targetName ?? 'infisical-run';
  const { committed: committedFiles } = taskEnvFiles({
    workspaceRoot: context.root,
    projectRoot: projectRoot ?? '.',
    target,
    configuration: context.configurationName,
    nonAtomizedTarget: nonAtomizedTarget(context, target)
  });
  const committed = readCommittedEnv(committedFiles);
  const environment = deployEnvironment(inherited);
  const cacheFile = offlineCacheFile(context.root, options.path);
  const cacheName = relative(context.root, cacheFile);

  let vault: Record<string, string>;
  try {
    vault =
      mode === 'offline'
        ? readOfflineCache(cacheFile)
        : fetchVault(options.path, environment).values;
  } catch (error) {
    console.error(
      `\ninfisical-run: ${error instanceof Error ? error.message : String(error)}`
    );
    if (!(error instanceof InfisicalMissingError) && mode !== 'offline') {
      console.error(
        `infisical-run: if Infisical is the problem, \`infisical login\` — or OFFLINE=1 to use ${cacheName} on purpose.`
      );
    }
    return { success: false };
  }

  const { apply, sources } = layerVault({
    inherited,
    committed,
    explicit: new Set(Object.keys(options.env ?? {})),
    vault
  });
  console.log(
    describeLayers({
      mode,
      environment,
      path: options.path,
      cacheName,
      sources
    })
  );

  return runAll(options.commands, cwd, { ...inherited, ...apply });
}
