import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { belongsTo, fly, listAppNames } from '../../services/fly';
import { CommandError, childEnv, run } from '../../services/shell';
import { deployments, tenancyConfig } from '../../services/tenancy';
import { APPS } from '../infisical/analysis.logic';

import {
  type DbRecord,
  type FlyAppReading,
  type HealthInput,
  type Reading,
  type SwitchRecord,
  type TenantRecord,
  failed,
  libpqEnv,
  ok,
  oneLine,
  parseSql,
  switchRecords
} from './platform.logic';

export const DATABASE_URL_ENV = 'PLATFORM_DATABASE_URL';
export const INFISICAL_ENVS = [
  'PLATFORM_INFISICAL_CLIENT_ID',
  'PLATFORM_INFISICAL_CLIENT_SECRET',
  'PLATFORM_INFISICAL_PROJECT_ID'
] as const;

const SQL_FILE = join(dirname(fileURLToPath(import.meta.url)), 'platform.sql');
const HEALTH_TIMEOUT_MS = 10_000;
const PSQL_TIMEOUT_MS = 30_000;

/** Tenants and database figures, from the read-only query beside this file */
export async function readDatabase(
  env: NodeJS.ProcessEnv
): Promise<Reading<{ tenants: TenantRecord[]; db: DbRecord }>> {
  const url = env[DATABASE_URL_ENV];
  if (!url) return failed(`${DATABASE_URL_ENV} is not set`);
  try {
    // The connection string goes through the child's env, never its arguments or our output
    const { stdout } = await run(
      'psql',
      [
        '--no-psqlrc',
        '-X',
        '-q',
        '-A',
        '-t',
        '-v',
        'ON_ERROR_STOP=1',
        '-f',
        SQL_FILE
      ],
      {
        env: childEnv(env, { ...libpqEnv(url), PGCONNECT_TIMEOUT: '10' }),
        timeout: PSQL_TIMEOUT_MS
      }
    );
    return ok(parseSql(stdout));
  } catch (error) {
    // A CommandError names the command and its stderr, which can quote the connection
    return failed(
      error instanceof CommandError
        ? `psql failed (${error.code}): ${error.stderr}`
        : error
    );
  }
}

/** `GET /api/health` of an app: down is a result, not a failed read */
export async function readHealth(app: string): Promise<HealthInput> {
  const started = Date.now();
  try {
    const response = await fetch(`https://${app}.fly.dev/api/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)
    });
    await response.body?.cancel();
    return {
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      ms: Date.now() - started,
      error: oneLine(error)
    };
  }
}

/** Machines, certificates and health of every production `cdwr-*` app */
export async function readFly(): Promise<Reading<FlyAppReading[]>> {
  let names: string[];
  try {
    names = (await listAppNames()).filter(
      (name) => name.startsWith('cdwr-') && belongsTo(name, 'production')
    );
  } catch (error) {
    return failed(error);
  }
  const apps: FlyAppReading[] = [];
  for (const name of names) {
    const [machines, certs, health] = await Promise.all([
      fly()
        .status({ app: name })
        .then((status) =>
          status ? ok(status.machines) : failed(`${name} was not found`)
        )
        .catch(failed),
      fly()
        .certs.list({ app: name })
        .then((list) =>
          ok(
            list.map(({ hostname, clientStatus }) => ({
              hostname,
              clientStatus
            }))
          )
        )
        .catch(failed),
      readHealth(name)
    ]);
    apps.push({ name, machines, certs, health });
  }
  return ok(apps);
}

/** The deploy switches of production, through the Infisical tenancy lib; never a secret value */
export async function readSwitches(
  env: NodeJS.ProcessEnv
): Promise<Reading<SwitchRecord[]>> {
  const [clientId, clientSecret, projectId] = INFISICAL_ENVS.map((n) => env[n]);
  if (!clientId || !clientSecret || !projectId) {
    return failed(`${INFISICAL_ENVS.join(', ')} are not all set`);
  }
  try {
    // The tenancy config is passed whole instead of putting these into process.env
    const config = tenancyConfig(
      {
        INFISICAL_CLIENT_ID: clientId,
        INFISICAL_CLIENT_SECRET: clientSecret,
        INFISICAL_PROJECT_ID: projectId
      },
      'production'
    );
    const plan = await deployments(config, [...APPS]);
    return ok(switchRecords('production', plan.deployments, plan.skipped));
  } catch (error) {
    return failed(error);
  }
}
