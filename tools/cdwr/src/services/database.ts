import { type ChildProcess, spawn } from 'node:child_process';
import { connect } from 'node:net';
import { join } from 'node:path';

import { toPoolerUrl } from '@codeware/shared/util/pure';

import { sshExec } from './fly';
import { type Environment, readSecret } from './infisical';
import { CommandError, childEnv, run, sleep, track } from './shell';

/** Supabase project region, which names the session-mode pooler host */
export const SUPABASE_REGION = 'eu-central-1';

/** The CMS connection string for an environment, through the pooler */
export async function cmsDatabaseUrl(
  environment: Environment
): Promise<string> {
  const url = await readSecret(environment, '/apps/cms', 'DATABASE_URL');
  return toPoolerUrl(url, SUPABASE_REGION);
}

/**
 * A preview database's connection string, read from inside a running machine.
 * Preview databases are attached during deploy, so the string exists only as a
 * Fly secret on the app, and `fly secrets list` returns digests, not values.
 * Every cms app of a pull request shares the database, so the host app is enough.
 */
export async function previewDatabaseUrl(app: string): Promise<string> {
  const output = await sshExec(app, 'printenv DATABASE_URL');
  const url = output
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('postgres'));
  if (!url) {
    throw new Error(
      `Could not read DATABASE_URL from '${app}':\n${output.trim()}`
    );
  }
  return url;
}

/** Production from Infisical, preview from the named cms app */
export const resolveDatabaseUrl = (
  environment: Environment,
  previewApp?: string
): Promise<string> =>
  environment === 'preview' && previewApp
    ? previewDatabaseUrl(previewApp)
    : cmsDatabaseUrl(environment);

const PROXY_PORT = 15432;
const TUNNEL_ATTEMPTS = 5;

const isFlyPrivateUrl = (url: string) =>
  /\.(flycast|internal)$/.test(new URL(url).hostname);

const isPortOpen = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = connect({ host: '127.0.0.1', port })
      .on('connect', () => {
        socket.destroy();
        resolve(true);
      })
      .on('error', () => resolve(false));
  });

/**
 * Whether a Postgres server answers on a local port. `fly proxy` listens
 * before the remote is reachable, so an accepted TCP connection proves
 * nothing; send an SSLRequest and require the one-byte reply a server gives.
 */
const isPostgresReady = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    let settled = false;
    const done = (ready: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      socket.destroy();
      resolve(ready);
    };
    const deadline = setTimeout(() => done(false), 5_000);
    socket.setTimeout(3_000);
    socket.on('connect', () => {
      const sslRequest = Buffer.alloc(8);
      sslRequest.writeInt32BE(8, 0);
      sslRequest.writeInt32BE(80877103, 4);
      socket.write(sslRequest);
    });
    socket.on('data', (data) => done(data[0] === 0x53 || data[0] === 0x4e));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
    socket.on('close', () => done(false));
  });

async function waitForPostgres(
  port: number,
  proxy: ChildProcess,
  timeoutMs = 30_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proxy.exitCode !== null || proxy.signalCode !== null) {
      throw new Error(
        `Fly proxy exited before opening port ${port} (${proxy.exitCode ?? proxy.signalCode})`
      );
    }
    if (await isPostgresReady(port)) return;
    await sleep(500);
  }
  throw new Error(
    `Fly proxy never carried a Postgres connection on port ${port}`
  );
}

async function withFlyProxy<T>(
  pgApp: string,
  remotePort: string,
  fn: (localPort: number) => Promise<T>
): Promise<T> {
  if (await isPortOpen(PROXY_PORT)) {
    throw new Error(
      `Port ${PROXY_PORT} is in use; the tunnel must be the only thing listening there`
    );
  }
  const proxy = track(
    spawn('flyctl', ['proxy', `${PROXY_PORT}:${remotePort}`, '--app', pgApp], {
      stdio: 'ignore'
    })
  );
  try {
    await waitForPostgres(PROXY_PORT, proxy);
    // The probe opened and dropped a connection; let the proxy settle
    await sleep(2_000);
    return await fn(PROXY_PORT);
  } finally {
    proxy.kill();
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && (await isPortOpen(PROXY_PORT))) {
      await sleep(250);
    }
  }
}

/**
 * Run `fn` against a database, tunnelling first when it is only reachable
 * inside Fly (`<pg-app>.flycast`). One tunnel per operation: one held open
 * across a prompt goes stale. A fresh tunnel can pass the probe and still
 * drop the next connection, so the caller says which failures are safe to
 * retry with a new tunnel; a write is never repeated.
 */
export async function withDatabase<T>(
  databaseUrl: string,
  fn: (url: string) => Promise<T>,
  options: {
    isRetryable?: (error: unknown) => boolean;
    onRetry?: (attempt: number) => void;
  } = {}
): Promise<T> {
  const once = () => {
    if (!isFlyPrivateUrl(databaseUrl)) return fn(databaseUrl);
    const url = new URL(databaseUrl);
    const pgApp = url.hostname.replace(/\.(flycast|internal)$/, '');
    return withFlyProxy(pgApp, url.port || '5432', (localPort) => {
      url.hostname = '127.0.0.1';
      url.port = String(localPort);
      return fn(url.toString());
    });
  };
  for (let attempt = 1; ; attempt++) {
    try {
      return await once();
    } catch (error) {
      if (attempt >= TUNNEL_ATTEMPTS || !options.isRetryable?.(error))
        throw error;
      options.onRetry?.(attempt);
      await sleep(2_000);
    }
  }
}

/**
 * Run a script under `apps/cms/src/utils` as an environment. The environment
 * decides which `PAYLOAD_SECRET_KEY` is loaded, and that key encrypts API
 * keys: inheriting the local one would read or write values the deployment
 * cannot decrypt.
 */
/** What the cms exit guard writes when a script's event loop drained on its own */
const GUARD_MESSAGE = 'ended without completing';

/**
 * Whether a failed run is the cms exit guard reporting a no-op.
 *
 * The guard fires only when the script's module graph stopped evaluating
 * before `main` ran (COD-433): nothing was reported and nothing was written.
 * That is the guard's contract, and it is what makes a retry safe — the same
 * script with the same inputs simply gets another go at winning the race.
 */
export const isGuardedNoOp = (error: unknown): boolean =>
  error instanceof CommandError && error.stderr.includes(GUARD_MESSAGE);

/**
 * Runs work again while it fails as a guarded no-op, a bounded number of times.
 *
 * Any other failure is thrown at once: a validation error, a missing tenant or
 * a dropped tunnel means something, and repeating it would only repeat it. The
 * race loses far more often than it wins on a busy machine — one in six was
 * measured — so the bound is generous: twenty attempts fail together about
 * two times in a hundred.
 */
export async function retryGuardedNoOp<T>(
  work: () => Promise<T>,
  attempts = 20
): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (!isGuardedNoOp(error)) throw error;
      last = error;
    }
  }
  throw new Error(
    `The cms script did nothing ${attempts} times in a row (COD-433). ` +
      'Each attempt was a proven no-op, so nothing was changed — run again.',
    { cause: last }
  );
}

export function runCmsScript(
  root: string,
  script: string,
  environment: Environment,
  env: Record<string, string>,
  parentEnv: NodeJS.ProcessEnv = process.env
): Promise<{ stdout: string; stderr: string }> {
  return retryGuardedNoOp(() =>
    runCmsScriptOnce(root, script, environment, env, parentEnv)
  );
}

function runCmsScriptOnce(
  root: string,
  script: string,
  environment: Environment,
  env: Record<string, string>,
  parentEnv: NodeJS.ProcessEnv
): Promise<{ stdout: string; stderr: string }> {
  return run('pnpm', ['exec', 'tsx', `src/utils/${script}`], {
    cwd: join(root, 'apps', 'cms'),
    env: childEnv(parentEnv, {
      DEPLOY_ENV: environment,
      // Host-mode operations across all tenants
      TENANT_ID: '',
      // Injected by the deployment action, required by the env schema
      APP_NAME: 'cdwr-cms',
      FLY_URL: '',
      PR_NUMBER: '',
      DISABLE_DB_PUSH: 'true',
      SEED_SOURCE: 'off',
      ...env
    })
  });
}

/** The value a script reports on a `KEY=value` line of its stdout */
export const reported = (stdout: string, key: string): string | undefined =>
  stdout.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1];

/** Replace the value of a `KEY=...` line, so an error can quote the output safely */
export const redactReported = (output: string, key: string): string =>
  output.replace(new RegExp(`^(${key}=).*$`, 'gm'), '$1<redacted>');
