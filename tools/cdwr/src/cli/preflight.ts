import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

import type { Need } from './command';
import { CliError, EXIT } from './errors';

/** Whether an executable is on PATH */
export function onPath(
  binary: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const dirs = (env['PATH'] ?? '').split(delimiter).filter(Boolean);
  return dirs.some((dir) => {
    try {
      accessSync(join(dir, binary), constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

/** Infisical is reachable when the env carries a project and one way to authenticate */
export const infisicalConfigured = (env: NodeJS.ProcessEnv): boolean =>
  Boolean(env['INFISICAL_PROJECT_ID']) &&
  Boolean(
    env['INFISICAL_SERVICE_TOKEN'] ||
    (env['INFISICAL_CLIENT_ID'] && env['INFISICAL_CLIENT_SECRET'])
  );

export interface Check {
  need: Need;
  ok: boolean;
  /** Where the requirement is satisfied from, or how to satisfy it */
  detail: string;
}

const BINARY: Partial<Record<Need, { binary: string; install: string }>> = {
  // fly-node and the tunnel spawn `flyctl`, so that is the binary that matters
  fly: { binary: 'flyctl', install: 'brew install flyctl' },
  psql: {
    binary: 'psql',
    install: 'brew install libpq && brew link --force libpq'
  },
  pg_dump: {
    binary: 'pg_dump',
    install: 'brew install libpq && brew link --force libpq'
  },
  docker: { binary: 'docker', install: 'install Docker Desktop' },
  aws: { binary: 'aws', install: 'brew install awscli' },
  gh: { binary: 'gh', install: 'brew install gh' }
};

export function check(need: Need, env: NodeJS.ProcessEnv = process.env): Check {
  if (need === 'infisical') {
    return infisicalConfigured(env)
      ? { need, ok: true, detail: 'credentials in the env file' }
      : {
          need,
          ok: false,
          detail: 'tools/cdwr/.env needs INFISICAL_* (see .env.example)'
        };
  }
  const { binary, install } = BINARY[need] ?? {
    binary: need,
    install: `install ${need}`
  };
  return onPath(binary, env)
    ? { need, ok: true, detail: `${binary} on PATH` }
    : { need, ok: false, detail: `${binary} not on PATH: ${install}` };
}

/** Throws before a command starts when something it needs is missing */
export function preflight(
  needs: Need[] = [],
  env: NodeJS.ProcessEnv = process.env
): void {
  const missing = needs.map((need) => check(need, env)).filter((c) => !c.ok);
  if (missing.length === 0) return;
  throw new CliError(
    `Missing: ${missing.map((c) => c.detail).join('; ')}`,
    EXIT.failed,
    'Run `cdwr doctor` for the full picture'
  );
}
