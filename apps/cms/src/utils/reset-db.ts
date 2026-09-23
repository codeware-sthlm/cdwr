// Must be first: installs the guard before any module that might not finish
import './exit-guard';

import { loadEnv } from '@codeware/app-cms/feature/env-loader';
import type { DrizzleAdapter } from '@payloadcms/drizzle';
import { getPayload } from 'payload';

import config from '../payload.config';

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
      process.exit(0);
    }
    console.error('❌ Failed to connect to database');
    process.exit(1);
  }

  // Truncate media collection separately to also delete the files on disk
  const { docs, errors } = await payload.delete({
    collection: 'media',
    where: {}
  });
  if (errors.length) {
    console.error('❌ Failed to delete media files');
    console.error(errors);
    process.exit(1);
  }
  if (docs.length) {
    console.log(`✅ Deleted ${docs.length} media files`);
  } else {
    console.log('✅ No media files to delete');
  }

  // Now drop the database
  const adapter = payload.db as DrizzleAdapter;
  await payload.db.dropDatabase({ adapter });
  console.log('✅ Dropped database');

  const end = Date.now();
  console.log(`✅ Reset took ${end - start} ms`);
  process.exit(0);
}

reset().catch((err) => {
  console.error('❌ Reset failed');
  console.error(err);
  process.exit(1);
});
