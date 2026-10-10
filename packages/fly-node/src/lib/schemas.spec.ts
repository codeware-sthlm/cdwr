import { join } from 'path';

import {
  SchemaRegistry,
  createSchemaTests
} from '@codeware/shared/util/testing/vitest';

import { AppIpAddressesApiResponseSchema } from './schemas/app-ip-addresses.schema';
import { AppsCreateTransformedResponseSchema } from './schemas/apps-create.schema';
import { AppsListTransformedResponseSchema } from './schemas/apps-list.schema';
import {
  CertificateApiResponseSchema,
  CertificateListApiResponseSchema
} from './schemas/certificate.schema';
import { CertsListWithAppTransformedResponseSchema } from './schemas/certs-list-with-app.schema';
import { CertsListTransformedResponseSchema } from './schemas/certs-list.schema';
import { ConfigShowResponseSchema } from './schemas/config-show.schema';
import { DeployResponseSchema } from './schemas/deploy.schema';
import { PostgresListTransformedResponseSchema } from './schemas/postgres-list';
import { PostgresUsersListTransformedResponseSchema } from './schemas/postgres-users-list';
import { SecretsListWithAppTransformedResponseSchema } from './schemas/secrets-list-with-app.schema';
import { SecretsListTransformedResponseSchema } from './schemas/secrets-list.schema';
import { StatusExtendedTransformedResponseSchema } from './schemas/status-extended.schema';
import { StatusTransformedResponseSchema } from './schemas/status.schema';
import { VersionTransformedResponseSchema } from './schemas/version.schema';

// Register all schemas and fixture keys to enable schema testing
SchemaRegistry.register(
  'fly/apps-create',
  AppsCreateTransformedResponseSchema,
  {
    name: 'AppsCreateTransformedResponseSchema',
    tags: ['fly']
  }
);
SchemaRegistry.register('fly/apps-list', AppsListTransformedResponseSchema, {
  name: 'AppsListTransformedResponseSchema',
  tags: ['fly']
});
SchemaRegistry.register(
  'lib/certs-list-with-app',
  CertsListWithAppTransformedResponseSchema,
  {
    name: 'CertsListWithAppTransformedResponseSchema',
    tags: ['lib']
  }
);
SchemaRegistry.register('fly/certs-list', CertsListTransformedResponseSchema, {
  name: 'CertsListTransformedResponseSchema',
  tags: ['fly']
});
// Captured from the GraphQL api against a real issued certificate, with the
// identifying values replaced — the shape is what the schema is proven against
SchemaRegistry.register('fly-api/certificate', CertificateApiResponseSchema, {
  name: 'CertificateApiResponseSchema',
  tags: ['fly-api']
});
SchemaRegistry.register(
  'fly-api/certificate-list',
  CertificateListApiResponseSchema,
  {
    name: 'CertificateListApiResponseSchema',
    tags: ['fly-api']
  }
);
SchemaRegistry.register(
  'fly-api/app-ip-addresses',
  AppIpAddressesApiResponseSchema,
  {
    name: 'AppIpAddressesApiResponseSchema',
    tags: ['fly-api']
  }
);
SchemaRegistry.register('fly/config-show', ConfigShowResponseSchema, {
  name: 'ConfigShowResponseSchema',
  tags: ['fly']
});
SchemaRegistry.register(
  'fly/postgres-list',
  PostgresListTransformedResponseSchema,
  {
    name: 'PostgresListTransformedResponseSchema',
    tags: ['fly']
  }
);
SchemaRegistry.register(
  'fly/postgres-users-list',
  PostgresUsersListTransformedResponseSchema,
  {
    name: 'PostgresUsersListTransformedResponseSchema',
    tags: ['fly']
  }
);
SchemaRegistry.register('lib/deploy', DeployResponseSchema, {
  name: 'DeployResponseSchema',
  tags: ['lib']
});
SchemaRegistry.register(
  'lib/secrets-list-with-app',
  SecretsListWithAppTransformedResponseSchema,
  {
    name: 'SecretsListWithAppTransformedResponseSchema',
    tags: ['lib']
  }
);
SchemaRegistry.register(
  'fly/secrets-list',
  SecretsListTransformedResponseSchema,
  {
    name: 'SecretsListTransformedResponseSchema',
    tags: ['fly']
  }
);
SchemaRegistry.register(
  'lib/status-extended',
  StatusExtendedTransformedResponseSchema,
  {
    name: 'StatusExtendedTransformedResponseSchema',
    tags: ['lib']
  }
);
SchemaRegistry.register('fly/status', StatusTransformedResponseSchema, {
  name: 'StatusTransformedResponseSchema',
  tags: ['fly']
});
SchemaRegistry.register('fly/version', VersionTransformedResponseSchema, {
  name: 'VersionTransformedResponseSchema',
  tags: ['fly']
});

// Run the tests
createSchemaTests({
  schemaDir: join(__dirname, 'schemas'),
  description: 'fly-node schema validation',
  groups: [
    { name: 'Fly CLI', tags: ['fly'] },
    { name: 'Fly GraphQL', tags: ['fly-api'] },
    { name: 'Lib Custom', tags: ['lib'] }
  ],
  snapshots: true
});
