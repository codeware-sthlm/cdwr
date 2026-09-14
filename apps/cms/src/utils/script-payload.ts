import { loadEnv } from '@codeware/app-cms/feature/env-loader';
import { type Payload, getPayload } from 'payload';

import { isSchemaNotReady } from './schema-not-ready';

/**
 * Payload's local API for a script run against a deployment's database.
 *
 * These scripts run outside Nx, so nothing pre-loads `.env.local`, and the
 * caller reaches the database differently than a deployment does — through a
 * pooler or a Fly proxy — so the URL is passed in rather than resolved.
 */
export async function getScriptPayload(databaseUrl: string): Promise<Payload> {
  // Set before loading: preview databases are created by `fly postgres attach`
  // and never reach Infisical, so the env would not validate without this.
  process.env['DATABASE_URL'] = databaseUrl;

  const env = await loadEnv();

  if (!env) {
    console.error('Environment variables could not be loaded, abort');
    process.exit(1);
  }

  // `loadEnv` injects the Infisical values over `process.env`, so anything the
  // caller set has just been overwritten. Re-apply what these scripts depend on
  // before the config reads it:
  // - the deployment's own DATABASE_URL host is not reachable from here
  // - a script must never seed or push schema to the target database
  process.env['DATABASE_URL'] = databaseUrl;
  process.env['SEED_SOURCE'] = 'off';
  process.env['DISABLE_DB_PUSH'] = 'true';

  console.log(`[DB] Using schema '${env.DATABASE_SCHEMA}'`);

  // Imported after `loadEnv` - the config reads `getEnv()` at module scope and
  // throws when the environment has not been hydrated yet.
  const { default: config } = await import('../payload.config');

  return getPayload({ config });
}

/**
 * Run a script whose caller reads the result from markers on stdout.
 *
 * Nothing here may end quietly. The caller can only tell success from failure
 * by those markers, so a swallowed error or an event loop that simply runs dry
 * would look like "no result" with an exit code of 0. `main` ends by calling
 * `process.exit` itself.
 */
export function runScript(label: string, main: () => Promise<void>): void {
  main()
    .then(() => {
      console.error(`Error: ${label} ended without reporting a result`);
      process.exit(1);
    })
    .catch((error) => {
      // Scripts run this checkout's config, so a database that has not run its
      // migrations fails on the first query. Say so instead of dumping the SQL
      if (isSchemaNotReady(error)) {
        console.error(
          'Error: this database is behind the schema this checkout expects. ' +
            'Deploy the pending migrations first, or run from the deployed code.'
        );
        process.exit(1);
      }

      console.error(`Error: ${error instanceof Error ? error.stack : error}`);
      process.exit(1);
    });

  process.on('beforeExit', (code) => {
    console.error(`Error: ${label} exited early (code ${code})`);
    process.exit(code || 1);
  });
}
