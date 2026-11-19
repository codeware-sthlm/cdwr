import { withInfisical } from '@codeware/shared/feature/infisical';
import { type Migration, getPayload } from 'payload';

import { getConfig } from './migrate.config';
import { migrations } from './migrations';

// Invoked via Fly release_command before machines are updated.
// Passes migrations directly so no filesystem read is required in the standalone build.
if (process.env.TENANT_ID) {
  console.log('[migrate] Tenant mode - migrations are managed by the host app');
  process.exit(0);
}

console.log('[migrate] Running migrations for cms host...');

try {
  // The runtime may connect through a transaction pooler, which has no session
  // for a migration to run in, so DIRECT_DATABASE_URL wins when it exists.
  // Both are env-specific and loaded from Infisical at runtime by the app.
  // The release machine has the Infisical credentials as Fly secrets, so the
  // vault is read unless the direct url is already a native Fly secret.
  let direct = process.env.DIRECT_DATABASE_URL;
  let url = process.env.DATABASE_URL;
  if (!direct && process.env.DEPLOY_ENV) {
    const secrets = await withInfisical({
      environment: process.env['DEPLOY_ENV'],
      filter: { path: '/apps/cms', recurse: true }
    });
    const secret = (key: string) =>
      secrets.find((s) => s.secretKey === key)?.secretValue;
    direct = secret('DIRECT_DATABASE_URL');
    url ||= secret('DATABASE_URL');
  }
  const databaseUrl = direct || url;
  if (!databaseUrl) {
    throw new Error(
      process.env.DEPLOY_ENV
        ? 'DATABASE_URL not available after loading from Infisical'
        : 'DEPLOY_ENV is not set — cannot load secrets from Infisical'
    );
  }
  process.env.DATABASE_URL = databaseUrl;

  // Build a minimal Payload instance with the same DB config as the main app,
  // and run the migrations directly against the database.
  // getConfig() is called here (not at import time) so DATABASE_URL is already set.
  const payload = await getPayload({
    config: getConfig(),
    disableOnInit: true
  });
  await payload.db.migrate({ migrations: migrations as Migration[] });
  process.exit(0);
} catch (error) {
  console.error('[migrate] Failed:', error);
  process.exit(1);
}
