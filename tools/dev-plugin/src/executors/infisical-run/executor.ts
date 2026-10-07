import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import {
  InfisicalMissingError,
  deployEnvironment,
  describeLayers,
  fetchVault,
  layerVault,
  offlineCacheFile,
  parseDotenv,
  readOfflineCache,
  secretsMode
} from '@codeware/shared/util/infisical-cli';
import type { ExecutorContext } from '@nx/devkit';

import type { InfisicalRunExecutorSchema } from './schema';

type Env = Record<string, string | undefined>;

/** The committed files Nx loads before an executor runs, later wins */
const readCommitted = (
  workspaceRoot: string,
  projectRoot: string
): Record<string, string> => {
  const committed: Record<string, string> = {};
  for (const dir of [workspaceRoot, projectRoot]) {
    const file = join(dir, '.env');
    if (existsSync(file)) {
      Object.assign(committed, parseDotenv(readFileSync(file, 'utf8')));
    }
  }
  return committed;
};

/** Runs one command, forwarding stop signals; resolves true when it ended well */
const runCommand = (command: string, cwd: string, env: Env): Promise<boolean> =>
  new Promise((resolvePromise) => {
    const child = spawn(command, { shell: true, stdio: 'inherit', cwd, env });
    let stopped = false;

    const forward = (signal: NodeJS.Signals) => () => {
      stopped = true;
      child.kill(signal);
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
      if (signal) {
        done(stopped && (signal === 'SIGINT' || signal === 'SIGTERM'));
      } else {
        done(code === 0);
      }
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

  const committed = readCommitted(
    context.root,
    resolve(context.root, projectRoot ?? '.')
  );
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
    if (error instanceof InfisicalMissingError || mode === 'offline') {
      console.error(
        `\ninfisical-run: ${error instanceof Error ? error.message : String(error)}`
      );
    } else {
      console.error(
        `\ninfisical-run: if Infisical is the problem, \`infisical login\` — or OFFLINE=1 to use ${cacheName} on purpose.`
      );
    }
    return { success: false };
  }

  const { apply, sources } = layerVault({ inherited, committed, vault });
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
