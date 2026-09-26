// Must be first: installs the guard before any module that might not finish
import './exit-guard';

import { report } from './report';
import { getScriptPayload, runScript } from './script-payload';

/**
 * Create a workspace using the local-api.
 *
 * `create` on the Tenants collection is restricted to a system user, which the
 * local-api bypasses with `overrideAccess`. That is why this runs as a script
 * rather than from the admin panel — the same reason rotation does.
 *
 * There is no password to state: the collection disables the local strategy, so
 * a tenant authenticates by API key alone, and `generateApiKeyHook` mints it.
 * The slug is derived from the name unless one is given.
 *
 * Driven by env vars so the caller controls the target:
 * - `CREATE_DATABASE_URL` - target database (required; the caller reaches it
 *   through a pooler or a Fly proxy rather than the way a deployment does)
 * - `CREATE_NAME` - the workspace's name (required)
 * - `CREATE_LOCALES` - comma-separated locales, defaulting to `en`
 * - `CREATE_SLUG` - overrides the slug derived from the name
 * - `CREATE_DEPLOYMENT` - the name its Fly apps and Infisical folder take
 * - `CREATE_DRY_RUN` - anything but `false` rolls the transaction back
 *
 * The result is written to stdout as `CREATED_TENANT=` for the caller. The API
 * key rides along in it, and nothing else prints it.
 */
async function createTenant() {
  const databaseUrl = process.env['CREATE_DATABASE_URL'];
  const name = process.env['CREATE_NAME'];

  // Only an explicit `false` commits. A missing or misspelled value rolls back,
  // which is the direction a mistake should fall
  const dryRun = process.env['CREATE_DRY_RUN'] !== 'false';

  for (const [key, value] of [
    ['CREATE_DATABASE_URL', databaseUrl],
    ['CREATE_NAME', name]
  ] as const) {
    if (!value) {
      console.error(`Error: ${key} is required`);
      process.exit(1);
    }
  }

  const locales = (process.env['CREATE_LOCALES'] || 'en')
    .split(',')
    .map((locale) => locale.trim())
    .filter(Boolean);

  const slug = process.env['CREATE_SLUG']?.trim() || undefined;
  const deployment = process.env['CREATE_DEPLOYMENT']?.trim() || undefined;

  const payload = await getScriptPayload(databaseUrl as string);

  const transactionID = await payload.db.beginTransaction();

  // A dry run without a transaction would write for real and still report
  // itself rolled back, which is worse than refusing to run
  if (transactionID === null || transactionID === undefined) {
    console.error(
      'Error: the database adapter started no transaction, so a dry run could not be rolled back'
    );
    process.exit(1);
  }

  try {
    const tenant = await payload.create({
      collection: 'tenants',
      data: {
        name: name as string,
        supportedLocales: locales as Array<'en' | 'sv'>,
        enableAPIKey: true,
        ...(slug ? { slug } : {}),
        ...(deployment ? { deployment } : {})
      },
      overrideAccess: true,
      req: { transactionID }
    });

    await (dryRun
      ? payload.db.rollbackTransaction(transactionID)
      : payload.db.commitTransaction(transactionID));

    console.log(
      `[CREATE] Workspace '${tenant.slug}' (id: ${tenant.id}), ${
        dryRun ? 'rolled back' : 'committed'
      }`
    );
    report(
      'CREATED_TENANT',
      JSON.stringify({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        supportedLocales: tenant.supportedLocales,
        deployment: tenant.deployment ?? null,
        apiKey: tenant.apiKey ?? null,
        dryRun
      })
    );

    process.exit(0);
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID);

    // `ensureUniqueSlug` reports a collision as an invalid field, which says
    // nothing about a slug the caller never typed because it came from the name
    if (String(error).includes('field is invalid: slug')) {
      console.error(
        `Error: the slug for '${name}' is already taken by another workspace. Pass CREATE_SLUG to choose a different one.`
      );
      process.exit(1);
    }

    throw error;
  }
}

runScript('tenant creation', createTenant);
