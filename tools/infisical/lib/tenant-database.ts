import { type ChildProcess, exec, spawn } from 'child_process';
import { connect } from 'net';
import path from 'path';
import { promisify } from 'util';

import { cancel, isCancel, select, type spinner } from '@clack/prompts';
import {
  type Environment,
  withInfisical
} from '@codeware/shared/feature/infisical';
import { toPoolerUrl } from '@codeware/shared/util/pure';

import { fly, startMachines, workspaceRoot } from './fly-apps';

const execAsync = promisify(exec);

// Supabase project region — used to construct the Session Mode pooler hostname
const SUPABASE_REGION = 'eu-central-1';

type Spinner = ReturnType<typeof spinner>;

/**
 * Resolve the production DATABASE_URL from Infisical.
 *
 * Production runs on Supabase, so the connection string is a managed secret.
 */
export async function fetchProductionDatabaseUrl(): Promise<string> {
  const secrets = await withInfisical({
    environment: 'production',
    filter: { path: '/apps/cms' }
  });

  const dbUrl = secrets?.find(
    ({ secretKey }) => secretKey === 'DATABASE_URL'
  )?.secretValue;

  if (!dbUrl) {
    throw new Error('DATABASE_URL not found in Infisical /apps/cms');
  }

  return toPoolerUrl(dbUrl, SUPABASE_REGION);
}

/**
 * Resolve a preview DATABASE_URL from the selected cms app.
 *
 * Preview databases are created by `fly postgres attach` during deploy, so the
 * connection string only exists as a Fly secret on the app itself - it is not
 * in Infisical and `fly secrets list` returns digests, not values. The only way
 * to read it back is from inside a running machine.
 *
 * All cms apps for a pull request share one database (`flyPostgresDatabaseName`),
 * so the host app is enough - the tenant-suffixed apps point at the same place.
 */
export async function fetchPreviewDatabaseUrl(app: string): Promise<string> {
  await startMachines(app);

  // `fly ssh console` prepends its own chatter when it picks a machine for you
  // ("No machine specified, using ..."), so take the line that is the value
  // rather than assuming the output is only the value
  const output = await fly.ssh.exec(app, 'printenv DATABASE_URL');
  const dbUrl = output
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('postgres'));

  if (!dbUrl) {
    throw new Error(
      `Could not read DATABASE_URL from app '${app}':\n${output.trim()}`
    );
  }

  return dbUrl;
}

/**
 * List the cms host apps deployed for open pull requests
 */
export async function fetchPreviewCmsApps(): Promise<Array<string>> {
  const apps = await fly.apps.list();

  return apps
    .map(({ name }) => name)
    .filter((name) => /-pr-\d+$/.test(name) && name.includes('cms'))
    .sort();
}

/** Local port used for the Fly proxy tunnel */
const PROXY_PORT = 15432;

/** How many times to rebuild the tunnel before giving up */
const TUNNEL_ATTEMPTS = 5;

/** Whether a connection string points at a Fly private network address */
const isFlyPrivateUrl = (dbUrl: string) =>
  /\.(flycast|internal)$/.test(new URL(dbUrl).hostname);

/** Whether something is already accepting connections on a local port */
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
 * Whether a Postgres server actually answers on a local port.
 *
 * `fly proxy` opens its listener immediately, well before the remote is
 * reachable, so an accepted TCP connection proves nothing. Handing that to
 * Payload is worse than waiting: its connect helper swallows the failure
 * (`catch (ignore)`) and returns, so the script would end with no logs, no
 * error and a success exit code.
 *
 * Send a Postgres SSLRequest and require the single-byte reply a real server
 * gives. No client library needed for a handshake this small.
 */
const isPostgresReady = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    let settled = false;

    // An explicit timer, because `socket.setTimeout` only covers inactivity
    // after connecting - a connect that never completes would leave this
    // promise pending forever, and a pending promise with no handles left is
    // how a Node process exits 0 having done nothing at all
    const deadline = setTimeout(() => done(false), 5_000);

    const done = (ready: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(deadline);
      socket.destroy();
      resolve(ready);
    };

    socket.setTimeout(3_000);
    socket.on('connect', () => {
      const sslRequest = Buffer.alloc(8);
      sslRequest.writeInt32BE(8, 0);
      sslRequest.writeInt32BE(80877103, 4);
      socket.write(sslRequest);
    });
    // 'S' (ssl supported) or 'N' (not) - either means a Postgres server
    socket.on('data', (data) => done(data[0] === 0x53 || data[0] === 0x4e));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
    socket.on('close', () => done(false));
  });

/** Wait until the tunnel carries a working Postgres connection */
async function waitForPostgres(
  port: number,
  proxy: ChildProcess,
  timeoutMs = 30_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // A proxy that died is never going to serve the port, and `fly proxy` exits
    // immediately when the port is taken or the app is unreachable
    if (proxy.exitCode !== null || proxy.signalCode !== null) {
      throw new Error(
        `Fly proxy exited before opening port ${port} (code ${proxy.exitCode ?? proxy.signalCode})`
      );
    }

    if (await isPostgresReady(port)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Fly proxy never carried a Postgres connection on port ${port}`
  );
}

/**
 * Run `fn` against the database, tunnelling first when it is only reachable
 * from inside Fly (`<pg-app>.flycast`).
 *
 * Deliberately per operation rather than one tunnel around the whole rotation.
 * A tunnel held open across a confirmation prompt goes stale while it waits,
 * and Payload's connect helper swallows the resulting failure - the script then
 * ends with no output and an exit code of 0.
 */
export async function withDatabase<T>(
  databaseUrl: string,
  fn: (dbUrl: string) => Promise<T>,
  onRetry: ((attempt: number) => void) | undefined,
  isRetryable: (error: unknown) => boolean
): Promise<T> {
  const run = () => {
    if (!isFlyPrivateUrl(databaseUrl)) {
      return fn(databaseUrl);
    }

    const url = new URL(databaseUrl);
    const pgApp = url.hostname.replace(/\.(flycast|internal)$/, '');

    return withFlyProxy(pgApp, url.port || '5432', (localPort) => {
      url.hostname = '127.0.0.1';
      url.port = String(localPort);
      return fn(url.toString());
    });
  };

  // A fresh tunnel can pass the readiness probe and still drop the connection
  // the script then opens - observed needing three goes - so retry with a new
  // proxy each time. The caller decides which failures are safe to retry, so a
  // write is never repeated.
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= TUNNEL_ATTEMPTS || !isRetryable(error)) {
        throw error;
      }

      onRetry?.(attempt);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
}

/**
 * Run `fn` with a Fly proxy tunnelling the Postgres app to localhost.
 *
 * Preview databases are only routable inside the Fly private network
 * (`<pg-app>.flycast`), so a local process cannot reach them without a tunnel.
 */
async function withFlyProxy<T>(
  pgApp: string,
  remotePort: string,
  fn: (localPort: number) => Promise<T>
): Promise<T> {
  // Refuse to reuse a port something else is already serving. Waiting on an
  // open port would otherwise succeed instantly and point the rotation at
  // whatever is listening, which could be a different database entirely.
  if (await isPortOpen(PROXY_PORT)) {
    throw new Error(
      `Port ${PROXY_PORT} is already in use - close it before rotating, ` +
        'the tunnel must be the only thing listening there'
    );
  }

  const proxy = spawn(
    'flyctl',
    ['proxy', `${PROXY_PORT}:${remotePort}`, '--app', pgApp],
    { stdio: 'ignore' }
  );

  try {
    await waitForPostgres(PROXY_PORT, proxy);

    // The probe above opens and drops a connection of its own. Give the proxy a
    // breath to re-establish before handing it something that matters.
    await new Promise((resolve) => setTimeout(resolve, 2_000));

    return await fn(PROXY_PORT);
  } finally {
    proxy.kill();

    // Killing the proxy does not free the port straight away, and the next
    // tunnel refuses to start while something is still listening
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && (await isPortOpen(PROXY_PORT))) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

/**
 * Ask which preview cms app to read the database from.
 *
 * Preview has one database per pull request, so the app has to be named
 * before anything can be read from it. Exits on cancel or failure.
 */
export async function selectPreviewApp(s: Spinner): Promise<string> {
  s.start('Listing preview cms apps...');

  let previewApps: Array<string>;
  try {
    previewApps = await fetchPreviewCmsApps();
    s.stop(`Found ${previewApps.length} preview cms app(s)`);
  } catch (error) {
    s.stop('Failed to list apps');
    cancel(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (!previewApps.length) {
    cancel('No preview cms apps are deployed');
    process.exit(0);
  }

  const selected = await select<string>({
    message: 'Select the cms app holding the preview database:',
    options: previewApps.map((app) => ({ value: app, label: app }))
  });

  if (isCancel(selected)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  return selected;
}

/**
 * Resolve the target database URL: Infisical for production, the named app
 * for preview. Exits on failure.
 */
export async function resolveDatabaseUrl(
  previewApp: string,
  s: Spinner
): Promise<string> {
  let databaseUrl: string;

  s.start(
    previewApp
      ? `Reading DATABASE_URL from '${previewApp}'...`
      : 'Fetching DATABASE_URL from Infisical...'
  );

  try {
    databaseUrl = previewApp
      ? await fetchPreviewDatabaseUrl(previewApp)
      : await fetchProductionDatabaseUrl();
    s.stop('Database URL resolved');
  } catch (error) {
    s.stop('Failed to resolve database URL');
    cancel(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  return databaseUrl;
}

/**
 * Run a cms script against a deployment's database, as that environment.
 *
 * @param script - File under `apps/cms/src/utils`
 * @param environment - Decides which `PAYLOAD_SECRET_KEY` is loaded, and that
 *   key encrypts API keys - inheriting the local one would read or write values
 *   the deployment cannot decrypt
 * @param env - The script's own variables
 */
export function runCmsScript(
  script: string,
  environment: Environment,
  env: Record<string, string>
): Promise<{ stdout: string; stderr: string }> {
  // This CLI runs under `tsx --tsconfig tools/tsconfig.tools.json`, which
  // exports its own instrumentation for child processes: the tsconfig path
  // (relative, so the child resolves it against `apps/cms` and dies) and a
  // NODE_PATH pointing into tsx's bundled node_modules, which quietly changes
  // how the child resolves modules. The child runs its own `npx tsx` and needs
  // none of it, so drop the lot rather than inherit a half-applied setup.
  const {
    TSX_TSCONFIG_PATH: _tsconfig,
    NODE_PATH: _nodePath,
    NODE_OPTIONS: _nodeOptions,
    ...parentEnv
  } = process.env;

  return execAsync(`npx tsx src/utils/${script}`, {
    cwd: path.join(workspaceRoot, 'apps/cms'),
    env: {
      ...parentEnv,
      DEPLOY_ENV: environment,
      // These scripts are host-mode operations across all tenants
      TENANT_ID: '',
      // Normally injected by the deployment action, and required by the env
      // schema even though a local script does not use them
      APP_NAME: 'cdwr-cms',
      FLY_URL: '',
      PR_NUMBER: '',
      DISABLE_DB_PUSH: 'true',
      SEED_SOURCE: 'off',
      ...env
    }
  });
}
