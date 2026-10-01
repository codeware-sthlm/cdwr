// Must be first: installs the guard before any module that might not finish
import './exit-guard';

import { mkdirSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadEnv } from '@codeware/app-cms/feature/env-loader';
import type { DrizzleAdapter } from '@payloadcms/drizzle';
import { getPayload } from 'payload';

import config from '../payload.config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * This script is used to reset the database for development purposes.
 * It will drop all tables and enums.
 */
async function reset() {
  const env = await loadEnv();

  if (!env) {
    console.warn('Environment variables could not be loaded, abort');
    process.exit(0);
  }

  if (env.DEPLOY_ENV !== 'development') {
    console.error(
      'Error: Resetting database is for development environment only!'
    );
    process.exit(0);
  }

  const start = Date.now();

  console.log(
    `[DB] Using ${env.DATABASE_URL} (schema: ${env.DATABASE_SCHEMA})`
  );

  // Uploads live on disk beside the database, so they go with it. Otherwise
  // the next seed's uploads collide with them and Payload stores suffixed copies
  const emptyMediaFolders = () => {
    const mediaRoot = path.resolve(dirname, '../..', env.MEDIA_DIR);
    for (const folder of ['media', 'stock-media']) {
      const dir = path.join(mediaRoot, folder);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
    }
    console.log(`✅ Emptied media folders under ${mediaRoot}`);
  };

  const payload = await getPayload({ config });

  // Query a collection to check if the database is empty
  try {
    await payload.db.count({
      collection: 'pages'
    });
  } catch (e) {
    const err = e as Error;
    const cause = err.cause as Error | undefined;
    const message = cause?.message ?? err.message;
    if (message.match(/relation "(.+)" does not exist/)) {
      console.log('✅ Database is empty, skipping reset');
      emptyMediaFolders();
      process.exit(0);
    }
    console.error('❌ Failed to connect to database');
    process.exit(1);
  }

  const adapter = payload.db as DrizzleAdapter;
  await payload.db.dropDatabase({ adapter });
  console.log('✅ Dropped database');

  emptyMediaFolders();

  const end = Date.now();
  console.log(`✅ Reset took ${end - start} ms`);
  process.exit(0);
}

reset().catch((err) => {
  console.error('❌ Reset failed');
  console.error(err);
  process.exit(1);
});
