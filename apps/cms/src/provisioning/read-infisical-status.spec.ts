import type { InfisicalSDK } from '@infisical/sdk';

import { readInfisicalStatus } from './read-infisical-status';

// The pure barrel also exports sanitize-html, whose parser ships ESM that jest
// cannot load, so it is narrowed to the real modules the reader uses
jest.mock('@codeware/shared/util/pure', () => ({
  ...jest.requireActual(
    '../../../../libs/shared/util/pure/src/lib/deploy-rules'
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

const rules = (apps: string, tenants: string): Secret => ({
  secretKey: 'DEPLOY_RULES',
  secretValue: '',
  secretMetadata: [
    { key: 'apps', value: apps },
    { key: 'tenants', value: tenants }
  ]
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
  it('reports each app folder, its key and the fly app it deploys as', async () => {
    const client = fakeClient(
      {
        'production|/': [rules('*', '*')],
        'production|/tenants/demo/apps/cms': [
          { secretKey: 'PAYLOAD_API_KEY', secretValue: 'own-key' },
          { secretKey: 'RESTRICTED_FONTS', secretValue: 'x' }
        ],
        'production|/tenants/demo/apps/web': [
          { secretKey: 'PAYLOAD_API_KEY', secretValue: 'other-key' }
        ],
        'preview|/': [rules('cms', '_default,demo')],
        'preview|/tenants/demo/apps/cms': [],
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
        tenants: 'wildcard',
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
        tenants: 'listed',
        apps: [
          {
            app: 'cms',
            flyApp: 'cdwr-cms-pr-<n>-demo',
            included: true,
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

  it('marks a workspace the tenants rule leaves out, with no folders', async () => {
    const client = fakeClient(
      {
        'production|/': [rules('*', '*')],
        'preview|/': [rules('*', '_default,demo')]
      },
      {}
    );

    const { environments } = await read(client, 'ks-vininfo');

    expect(environments).toEqual([
      {
        environment: 'production',
        access: 'ok',
        tenants: 'wildcard',
        apps: []
      },
      { environment: 'preview', access: 'ok', tenants: 'excluded', apps: [] }
    ]);
  });

  it('reports an environment it cannot read or judge', async () => {
    const client = fakeClient(
      {
        'production|/': [{ secretKey: 'OTHER', secretValue: '' }],
        'preview|/': 403
      },
      {}
    );

    const { environments } = await read(client);

    expect(environments).toEqual([
      { environment: 'production', access: 'no-rules' },
      { environment: 'preview', access: 'unreadable' }
    ]);
  });

  it('treats a workspace without a key as not matching', async () => {
    const client = fakeClient(
      {
        'production|/': [rules('cms', '*')],
        'production|/tenants/demo/apps/cms': [
          { secretKey: 'PAYLOAD_API_KEY', secretValue: 'own-key' }
        ],
        'preview|/': 403
      },
      { 'production|/tenants/demo/apps': ['cms'] }
    );

    const { environments } = await read(client, 'demo', null);

    expect(environments[0]).toMatchObject({
      apps: [{ app: 'cms', apiKey: 'mismatch' }]
    });
  });

  it('reads only the environments it is given', async () => {
    const client = fakeClient(
      { 'production|/': 403, 'preview|/': [rules('*', '*')] },
      {}
    );

    const { environments } = await read(client, 'demo', 'own-key', ['preview']);

    expect(environments).toEqual([
      { environment: 'preview', access: 'ok', tenants: 'wildcard', apps: [] }
    ]);
  });

  it('lets a failure that is not about access through', async () => {
    const client = fakeClient({ 'production|/': 500, 'preview|/': 500 }, {});

    await expect(read(client)).rejects.toThrow('sdk');
  });
});
