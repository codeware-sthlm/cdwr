// Must be first: installs the guard before any module that might not finish
import './exit-guard';

import { loadEnv } from '@codeware/app-cms/feature/env-loader';
import { getPayload } from 'payload';

import config from '../payload.config';

/**
 * Ad-hoc run the seed process using the local-api only.
 *
 * This is used for seeding the database without spinning up the entire server.
 */
const doSeed = async (): Promise<void> => {
  const env = await loadEnv();

  if (!env) {
    console.warn(
      'Environment variables could not be loaded, abort seed process'
    );
    process.exit(0);
  }

  if (env.DEPLOY_ENV === 'production') {
    console.error(
      'Error: Ad-hoc seed process is not allowed in production environment!'
    );
    process.exit(0);
  }

  console.log(
    `[DB] Using ${env.DATABASE_URL} (schema: ${env.DATABASE_SCHEMA})`
  );

  // Seed will trigger on payload init
  await getPayload({ config });

  process.exit(0);
};

doSeed();
