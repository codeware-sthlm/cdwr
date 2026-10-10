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
// Not devkit API, but the same code `nx:run-commands` runs: PATH, pty, signals and process trees on every OS
import { runCommands } from 'nx/src/executors/run-commands/run-commands.impl';

import type { InfisicalRunExecutorSchema } from './schema';

type Env = Record<string, string | undefined>;

/** Runs the commands in order through `nx:run-commands`, with `env` over the inherited environment */
const runAll = async (
  commands: string[],
  cwd: string,
  env: Record<string, string>,
  context: ExecutorContext
): Promise<{ success: boolean }> => {
  const task = await runCommands(
    { commands, cwd, parallel: false, env, __unparsed__: [] },
    context
  );
  const { code } = await task.getResults();
  return { success: code === 0 };
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
    return runAll(options.commands, cwd, options.env ?? {}, context);
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

  return runAll(options.commands, cwd, { ...options.env, ...apply }, context);
}
