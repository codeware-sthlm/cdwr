import type {
  CreateAppResponse,
  ListAppResponse,
  ListCertForAllResponse,
  ListCertForAppResponse,
  ListIpResponse,
  ListPostgresResponse,
  ListPostgresUsersResponse,
  ListSecretForAllResponse,
  ListSecretForAppResponse,
  StatusResponse
} from './types';

/**
 * Mock definitions for the tests which are used in the mock rules and data.
 */
export const mockDefs = {
  /** Test api token */
  token: 'test-token',
  /** Test organization used for all apps and configs */
  org: 'test-org',

  /** Test app is deployed and attached to postgres */
  testApp: 'test-app',
  /** Test config is available and the app is deployed with it */
  testConfig: 'test/fly.toml',
  /** New app does not exist to begin with but will be created and deployed */
  newApp: 'new-app',

  newConfig: 'new/fly.toml',
  /** New app with a generated name */
  generatedAppName: 'generated-name-app',
  /** Postgres cluster attached to test app */
  postgresAttached: 'db-app-attached',
  /** Postgres cluster never attached to any app */
  postgresNotAttached: 'db-app-prestine',
  /** Unknown app that does not exist and will never be found */
  unknownApp: 'unknown-app',
  /** Unknown config that does not exist */
  unknownConfig: 'unknown/fly.toml',

  /** Test secret that exists in the app */
  testSecret: 'EXISTING_SECRET'
};

/**
 * Mock `fly apps list` response for testing.
 */
export const mockAppsListResponse: ListAppResponse = [
  {
    id: mockDefs.testApp,
    name: mockDefs.testApp,
    status: 'deployed',
    deployed: true,
    hostname: `${mockDefs.testApp}.fly.dev`,
    organization: {
      name: 'test organization',
      slug: mockDefs.org
    },
    currentRelease: {
      status: 'complete',
      createdAt: '2024-01-01T00:00:00Z'
    }
  },
  {
    id: mockDefs.generatedAppName,
    name: mockDefs.generatedAppName,
    status: 'pending',
    deployed: false,
    hostname: `${mockDefs.generatedAppName}.fly.dev`,
    organization: {
      name: 'test organization',
      slug: mockDefs.org
    },
    currentRelease: null
  }
];

/**
 * Mock `fly apps create` response for testing.
 *
 * @param app - The app name to use in the response (defaults to `mockDefs.testApp`)
 */
export const mockCreateAppResponse = (
  app: string = mockDefs.testApp
): CreateAppResponse => ({
  id: 'test-id',
  name: app
});

/**
 * Mock `fly certs list` response for testing.
 */
export const mockListCertForAppResponse: ListCertForAppResponse = [
  {
    clientStatus: 'Ready',
    createdAt: '2024-01-01T00:00:00Z',
    hostname: `${mockDefs.testApp}.fly.dev`
  },
  {
    clientStatus: 'Pending', // TODO: Check if this is correct
    createdAt: '2024-02-01T00:00:00Z',
    hostname: '*.custom.io'
  }
];

/**
 * Mock `fly certs list` response for all apps for testing.
 *
 * All apps from `mockAppsListResponse` gets the same certificates from `mockListCertForAppResponse`
 */
export const mockListCertForAllResponse: ListCertForAllResponse =
  mockAppsListResponse
    .map((app) =>
      mockListCertForAppResponse.map((c) => ({ ...c, app: app.name }))
    )
    .flat();

/**
 * Mock `fly postgres list` response for testing.
 *
 * TODO: Mock the string response when there are no Postgres clusters.
 */
export const mockListPostgresResponse: ListPostgresResponse = [
  {
    id: mockDefs.postgresAttached,
    name: mockDefs.postgresAttached,
    status: 'deployed',
    deployed: true,
    hostname: `${mockDefs.postgresAttached}.fly.dev`,
    organization: {
      id: 'org-id',
      slug: mockDefs.org
    },
    version: 0
  },
  {
    id: mockDefs.postgresNotAttached,
    name: mockDefs.postgresNotAttached,
    status: 'deployed',
    deployed: true,
    hostname: `${mockDefs.postgresNotAttached}.fly.dev`,
    organization: {
      id: 'org-id',
      slug: mockDefs.org
    },
    version: 0
  }
];

/**
 * Mock `fly postgres users list` response for testing.
 */
export const mockListPostgresUsersResponse: ListPostgresUsersResponse = [
  {
    username: 'test_app',
    superuser: true,
    databases: ['test_app', 'postgres', 'repmgr']
  },
  {
    username: 'flypgadmin',
    superuser: true,
    databases: ['postgres', 'repmgr']
  }
];

/**
 * Mock `fly secrets list` response for testing.
 */
export const mockListSecretForAppResponse: ListSecretForAppResponse = [
  {
    digest: 'abc123',
    name: mockDefs.testSecret
  }
];

/**
 * Mock `fly secrets list` response for all apps for testing.
 *
 * All apps from `mockAppsListResponse` gets the same secrets from `mockListSecretForAppResponse`
 */
export const mockListSecretForAllResponse: ListSecretForAllResponse =
  mockAppsListResponse
    .map((app) =>
      mockListSecretForAppResponse.map((s) => ({ ...s, app: app.name }))
    )
    .flat();

/**
 * Mock `fly config show` response for testing.
 *
 * @param app - The app name to use in the response (defaults to `mockDefs.testApp`)
 */
export const mockShowConfigResponse = (app: string = mockDefs.testApp) => ({
  app,
  primaryRegion: 'arn',
  build: {
    dockerfile: 'Dockerfile'
  },
  httpService: {
    internalPort: 3001,
    forceHttps: true,
    autoStopMachines: true,
    autoStartMachines: true,
    minMachinesRunning: 0,
    processes: ['app']
  }
});

/**
 * Mock `fly status` response for testing.
 *
 * @param app - The app name to use in the response (defaults to `mockDefs.testApp`)
 */
export const mockStatusResponse = (
  app: string = mockDefs.testApp
): StatusResponse => ({
  deployed: true,
  hostname: `${app}.fly.dev`,
  id: app,
  machines:
    app === mockDefs.testApp
      ? [
          {
            id: 'machine-id',
            name: 'machine-name',
            state: 'running',
            region: 'iam',
            imageRef: {
              registry: 'registry.fly.io',
              repository: app,
              tag: 'deployment-01TEST000000000000000000',
              digest:
                'sha256:0000000000000000000000000000000000000000000000000000000000000000'
            },
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-02-01T00:00:00Z',
            config: {
              env: { NODE_ENV: 'test' },
              metadata: {
                fly_platform_version: 'fly-v1.0.0',
                mock_key: 'mock_value'
              }
            },
            events: [
              {
                type: 'start',
                status: 'success',
                timestamp: 1715000000
              },
              {
                type: 'deploy',
                status: 'success',
                timestamp: 1717000000
              }
            ],
            hostStatus: 'ok'
          }
        ]
      : [],
  name: app,
  organization: {
    id: 'org-id',
    slug: mockDefs.org
  },
  status: app === mockDefs.testApp ? 'deployed' : 'pending',
  version: app === mockDefs.testApp ? 1 : 0
});

/**
 * Mock `fly status --json` response where one of two machines is reported
 * mid-update, without `image_ref`, `config` and `events`.
 *
 * @param app - The app name to use in the response (defaults to `mockDefs.testApp`)
 */
export const mockPartialStatusResponse = (app: string = mockDefs.testApp) => {
  const full = mockStatusResponse(mockDefs.testApp);
  const [machine] = full.machines;
  return {
    ...full,
    hostname: `${app}.fly.dev`,
    id: app,
    name: app,
    machines: [
      machine,
      {
        id: 'machine-id-updating',
        name: 'machine-name-updating',
        state: 'replacing',
        region: 'iam',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-02-01T00:00:00Z',
        hostStatus: 'ok'
      }
    ]
  };
};

/**
 * Mock `fly version` response for testing.
 */
export const mockVersionResponse = {
  Name: 'fly',
  Version: '0.4.33',
  Commit: '641eb1c8b884eb191d574de8e11b8423e86e3260',
  BranchName: '',
  BuildDate: '2025-12-25T16:00:57Z',
  OS: 'darwin',
  Architecture: 'arm64',
  Environment: 'production'
};

/**
 * A production-shaped address pair: free shared v4 plus dedicated v6.
 *
 * The shared v4 carries an empty region and a zero timestamp, which is what
 * Fly actually answers and the reason neither is parsed as a datetime.
 */
export const mockListIpResponse: ListIpResponse = [
  {
    id: '',
    address: '2a09:8280:1::5e:cd90:0',
    type: 'v6',
    region: 'global',
    createdAt: '2025-01-12T00:00:35.577Z'
  },
  {
    id: '',
    address: '66.241.125.38',
    type: 'shared_v4',
    region: '',
    createdAt: '0001-01-01T00:00:00Z'
  }
];
