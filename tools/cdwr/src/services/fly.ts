import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Fly } from '@cdwr/fly-node';
import { getAppName } from '@codeware/shared/util/pure';
import * as TOML from 'smol-toml';

import { run, sleep } from './shell';

let client: Fly | undefined;

/**
 * One silent Fly client for every command. Commands print through the UI, and
 * some of what the Fly CLI prints (ssh output, secret values) must not leak.
 */
export function fly(): Fly {
  client ??= new Fly({
    logger: {
      info: () => undefined,
      error: () => undefined,
      traceCLI: false,
      redactSecrets: true,
      verbose: false,
      debug: false,
      streamToConsole: false
    }
  });
  return client;
}

/** Base Fly app name from an app's own fly.toml */
export function configAppName(root: string, app: string): string {
  const file = join(root, 'apps', app, 'fly.toml');
  const config = TOML.parse(readFileSync(file, 'utf8')) as { app?: string };
  if (!config.app) throw new Error(`No app name in ${file}`);
  return config.app;
}

/**
 * The Fly app name of a tenant's deployment of an app, with the same pull
 * request and tenant suffixes the deployment action applies.
 */
export const flyAppName = (
  root: string,
  app: string,
  tenantId: string,
  pullRequest?: number
): string =>
  getAppName({
    configAppName: configAppName(root, app),
    environment: pullRequest ? 'preview' : 'production',
    pullRequest,
    tenantId
  });

/** The pull request number a preview app name carries, if any */
export const pullRequestOf = (appName: string): number | undefined => {
  const match = appName.match(/-pr-(\d+)(?:-|$)/);
  return match ? Number(match[1]) : undefined;
};

/** Whether an app name belongs to preview (carries a PR number) or production */
export const belongsTo = (
  appName: string,
  environment: 'preview' | 'production'
): boolean =>
  (environment === 'preview') === (pullRequestOf(appName) !== undefined);

/** Names of every deployed app, sorted */
export async function listAppNames(): Promise<string[]> {
  const apps = await fly().apps.list();
  return apps.map(({ name }) => name).sort();
}

/** The cms host apps deployed for open pull requests, one per preview database */
export async function listPreviewCmsApps(): Promise<string[]> {
  const names = await listAppNames();
  return names.filter((name) => /-pr-\d+$/.test(name) && name.includes('cms'));
}

/** Machines of an app; throws when there are none, which means not deployed */
export async function machinesOf(app: string) {
  const status = await fly().status({ app });
  const machines = status?.machines ?? [];
  if (!machines.length) {
    throw new Error(`App '${app}' has no machines - is it deployed?`);
  }
  return machines;
}

/**
 * Start every machine that is not running. Preview machines suspend when idle,
 * and Fly can neither ssh into nor update a machine that is not started.
 */
export async function startMachines(app: string): Promise<void> {
  const stopped = (await machinesOf(app)).filter((m) => m.state !== 'started');
  for (const machine of stopped) await fly().machines.start(app, machine.id);
  if (stopped.length) await sleep(5_000);
}

/**
 * Restart every machine of an app so it re-reads its runtime configuration,
 * one machine at a time so the app keeps serving. Stop then start is a cold
 * boot; a suspended machine resumed from its snapshot re-reads nothing.
 */
export async function restartMachines(
  app: string,
  onMachine?: (id: string, index: number, total: number) => void
): Promise<number> {
  const machines = await machinesOf(app);
  for (const [index, machine] of machines.entries()) {
    onMachine?.(machine.id, index, machines.length);
    await fly().machines.restart(app, machine.id);
  }
  return machines.length;
}

/**
 * Set the number of machines of an app. fly-node has no scale call, so this
 * runs `flyctl scale count`, which creates or destroys machines as needed.
 */
export async function scaleMachines(app: string, count: number): Promise<void> {
  await run('flyctl', ['scale', 'count', String(count), '-a', app, '--yes'], {
    timeout: 10 * 60_000
  });
}

/** Run a command inside a machine and return what it printed */
export async function sshExec(app: string, command: string): Promise<string> {
  await startMachines(app);
  return fly().ssh.exec(app, command);
}

/**
 * Stage secrets on several apps and apply them together, so apps that share
 * a value flip at the same time. Returns the apps left unfinished on failure.
 */
export async function setSecretsTogether(
  apps: string[],
  secrets: Record<string, string>,
  onApp?: (app: string, phase: 'stage' | 'apply') => void
): Promise<void> {
  for (const app of apps) {
    onApp?.(app, 'stage');
    await fly().secrets.set(secrets, { app, stage: true });
  }
  for (const app of apps) {
    onApp?.(app, 'apply');
    await fly().secrets.deploy(app);
  }
}

export interface FlyToken {
  id: string;
  name: string;
  /** ISO 8601 */
  expiresAt: string;
  /** ISO 8601, set once the token is revoked */
  revokedAt?: string;
}

/** `2046-11-11 06:47:50 +0000 UTC` to `2046-11-11T06:47:50Z`, undefined when it is not that */
const flyTimestamp = (cell: string): string | undefined => {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) \+0000 UTC$/.exec(
    cell
  );
  return match ? `${match[1]}T${match[2]}Z` : undefined;
};

/** Parses the table `fly tokens list` prints, which has no JSON output */
export function parseFlyTokens(output: string): FlyToken[] {
  const tokens: FlyToken[] = [];
  for (const line of output.split(/\r?\n/)) {
    const cells = line.split('│').map((cell) => cell.trim());
    const [id, name, , expires, revoked] = cells;
    if (cells.length < 4 || !id || !name || !expires) continue;
    const expiresAt = flyTimestamp(expires);
    if (!expiresAt) continue;
    const revokedAt = revoked ? flyTimestamp(revoked) : undefined;
    tokens.push({ id, name, expiresAt, ...(revokedAt ? { revokedAt } : {}) });
  }
  return tokens;
}

export type TokenExpiry =
  | { state: 'found'; expiresAt: string }
  | { state: 'expired'; expiresAt: string }
  | { state: 'missing' }
  | { state: 'ambiguous' };

/**
 * The expiry of the one unexpired token with this name. Revoked tokens do not
 * count; with none unexpired, one expired token is reported as expired.
 */
export function tokenExpiryByName(
  tokens: FlyToken[],
  name: string,
  now: Date = new Date()
): TokenExpiry {
  const live = tokens.filter(
    (token) => token.name === name && !token.revokedAt
  );
  const unexpired = live.filter((token) => new Date(token.expiresAt) > now);
  const [current] = unexpired;
  if (current) {
    return unexpired.length > 1
      ? { state: 'ambiguous' }
      : { state: 'found', expiresAt: current.expiresAt };
  }
  const [lapsed] = live;
  if (!lapsed) return { state: 'missing' };
  return live.length > 1
    ? { state: 'ambiguous' }
    : { state: 'expired', expiresAt: lapsed.expiresAt };
}

/**
 * The org's tokens. Runs on the user's own fly login: a token in the env
 * would list that token's org view instead.
 */
export async function listOrgTokens(org = 'codeware'): Promise<FlyToken[]> {
  const env = { ...process.env };
  delete env['FLY_API_TOKEN'];
  delete env['FLY_ACCESS_TOKEN'];
  const { stdout } = await run(
    'flyctl',
    ['tokens', 'list', '-o', org, '-s', 'org'],
    {
      env
    }
  );
  return parseFlyTokens(stdout);
}
