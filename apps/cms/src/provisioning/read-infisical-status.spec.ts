import type { InfisicalSDK } from '@infisical/sdk';

import { readInfisicalStatus } from './read-infisical-status';

// The pure barrel also exports sanitize-html, whose parser ships ESM that jest
// cannot load, so it is narrowed to the real modules the reader uses
jest.mock('@codeware/shared/util/pure', () => ({
  ...jest.requireActual(
    '../../../../libs/shared/util/pure/src/lib/deploy-enabled'
  ),
  ...jest.requireActual(
    '../../../../libs/shared/util/pure/src/lib/get-app-name'
  )
}));

type Secret = {
  secretKey: string;
  secretValue: string;
  secretMetadata?: unknown;
};

/** An SDK failure as the error helpers read it */
const failure = (status: number) => Object.assign(new Error('sdk'), { status });

/**
 * A client serving secrets from a map keyed `environment|path`. A value that
 * is a number is thrown as that status instead.
 */
const fakeClient = (
  secrets: Record<string, Array<Secret> | number>,
  folders: Record<string, Array<string> | number>
) =>
  ({
    secrets: () => ({
      listSecretsWithImports: async ({
        environment,
        secretPath
      }: {
        environment: string;
        secretPath: string;
      }) => {
        const found = secrets[`${environment}|${secretPath}`] ?? [];
        if (typeof found === 'number') throw failure(found);
        return found;
      }
    }),
    folders: () => ({
      listFolders: async ({
        environment,
        path
      }: {
        environment: string;
        path: string;
      }) => {
        const found = folders[`${environment}|${path}`] ?? 404;
        if (typeof found === 'number') throw failure(found);
        return found.map((name) => ({ name }));
      }
    })
  }) as unknown as InfisicalSDK;

const enabled = (value: string): Secret => ({
  secretKey: 'DEPLOY_ENABLED',
  secretValue: value
});

const read = (
  client: InfisicalSDK,
  deployment = 'demo',
  apiKey: string | null = 'own-key',
  environments: Array<'production' | 'preview'> = ['production', 'preview']
) =>
  readInfisicalStatus({
    client,
    environments,
    projectId: 'project',
    deployment,
    apiKey,
    statusOf: (error) => (error as { status?: number }).status
  });

describe('readInfisicalStatus', () => {
  it('reports each app folder, its flag, key and the fly app it deploys as', async () => {
    const client = fakeClient(
      {
        'production|/tenants/demo/apps/cms': [
          enabled('true'),
          { secretKey: 'PAYLOAD_API_KEY', secretValue: 'own-key' },
          { secretKey: 'RESTRICTED_FONTS', secretValue: 'x' }
        ],
        'production|/tenants/demo/apps/web': [
          enabled(' TRUE '),
          { secretKey: 'PAYLOAD_API_KEY', secretValue: 'other-key' }
        ],
        'preview|/tenants/demo/apps/cms': [enabled('false')],
        'preview|/tenants/demo/apps/web': [
          { secretKey: 'PAYLOAD_API_KEY', secretValue: 'own-key' }
        ]
      },
      {
        'production|/tenants/demo/apps': ['cms', 'web', 'unknown'],
        'preview|/tenants/demo/apps': ['cms', 'web']
      }
    );

    const { environments } = await read(client);

    expect(environments).toEqual([
      {
        environment: 'production',
        access: 'ok',
        apps: [
          {
            app: 'cms',
            flyApp: 'cdwr-cms-demo',
            included: true,
            apiKey: 'matches',
            optionalKeys: ['RESTRICTED_FONTS']
          },
          {
            app: 'web',
            flyApp: 'cdwr-web-demo',
            included: true,
            apiKey: 'mismatch',
            optionalKeys: []
          }
        ]
      },
      {
        environment: 'preview',
        access: 'ok',
        apps: [
          {
            app: 'cms',
            flyApp: 'cdwr-cms-pr-<n>-demo',
            included: false,
            apiKey: 'missing',
            optionalKeys: []
          },
          {
            app: 'web',
            flyApp: 'cdwr-web-pr-<n>-demo',
            included: false,
            apiKey: 'matches',
            optionalKeys: []
          }
        ]
      }
    ]);
  });

  it('reports no apps when the workspace has no folder', async () => {
    const client = fakeClient({}, { 'production|/tenants/demo/apps': 404 });

    const { environments } = await read(client);

    expect(environments).toEqual([
      { environment: 'production', access: 'ok', apps: [] },
      { environment: 'preview', access: 'ok', apps: [] }
    ]);
  });

  it.each([401, 403])(
    'reports an environment as unreadable on %s',
    async (status) => {
      const client = fakeClient(
        {},
        {
          'production|/tenants/demo/apps': status,
          'preview|/tenants/demo/apps': 404
        }
      );

      const { environments } = await read(client);

      expect(environments).toEqual([
        { environment: 'production', access: 'unreadable' },
        { environment: 'preview', access: 'ok', apps: [] }
      ]);
    }
  );

  it('treats a workspace without a key as not matching', async () => {
    const client = fakeClient(
      {
        'production|/tenants/demo/apps/cms': [
          { secretKey: 'PAYLOAD_API_KEY', secretValue: 'own-key' }
        ]
      },
      { 'production|/tenants/demo/apps': ['cms'] }
    );

    const { environments } = await read(client, 'demo', null, ['production']);

    expect(environments[0]).toMatchObject({
      apps: [{ app: 'cms', apiKey: 'mismatch' }]
    });
  });

  it('reads only the environments it is given', async () => {
    const client = fakeClient({}, {});

    const { environments } = await read(client, 'demo', 'own-key', ['preview']);

    expect(environments).toEqual([
      { environment: 'preview', access: 'ok', apps: [] }
    ]);
  });

  it('lets a failure that is not about access through', async () => {
    const client = fakeClient(
      {},
      {
        'production|/tenants/demo/apps': 500,
        'preview|/tenants/demo/apps': 500
      }
    );

    await expect(read(client)).rejects.toThrow('sdk');
  });
});
