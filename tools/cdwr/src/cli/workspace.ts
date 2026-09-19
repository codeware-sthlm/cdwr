import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as dotenv from 'dotenv';

export interface Workspace {
  root: string;
  version: string;
  /** The env file that was loaded, if any */
  envFile?: string;
  /** Credentials still live at the pre-rewrite path */
  legacyEnvFile?: string;
}

export const ENV_FILE = 'tools/cdwr/.env';
export const LEGACY_ENV_FILE = 'tools/infisical/.env.infisical';

/** Walk up until a directory holds nx.json */
export function findRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, 'nx.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`No workspace root above ${from}`);
    dir = parent;
  }
}

const gitSha = (root: string): string => {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: root,
    encoding: 'utf8'
  });
  return result.status === 0 ? result.stdout.trim() : '';
};

/** Locate the workspace, load its env file and read its version */
export function loadWorkspace(env: NodeJS.ProcessEnv = process.env): Workspace {
  const root =
    env['CDWR_ROOT'] ?? findRoot(dirname(fileURLToPath(import.meta.url)));
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    version?: string;
  };
  const sha = gitSha(root);
  const version = `${pkg.version ?? '0.0.0'}${sha ? ` (${sha})` : ''}`;

  const current = join(root, ENV_FILE);
  const legacy = join(root, LEGACY_ENV_FILE);
  const workspace: Workspace = { root, version };
  const load = (path: string) =>
    dotenv.config({
      path,
      quiet: true,
      processEnv: env as Record<string, string>
    });
  if (existsSync(current)) {
    load(current);
    workspace.envFile = current;
  } else if (existsSync(legacy)) {
    load(legacy);
    workspace.envFile = legacy;
    workspace.legacyEnvFile = legacy;
  }
  return workspace;
}
