import { existsSync, mkdirSync, writeFileSync } from 'fs';
import process from 'process';

import { spawn, spawnPty } from '@codeware/shared/util/misc';
import { Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExecFlyOptions, Fly } from './fly.class';
import {
  mockAppsListResponse,
  mockCreateAppResponse,
  mockDefs,
  mockListCertForAllResponse,
  mockListCertForAppResponse,
  mockListIpResponse,
  mockListPostgresResponse,
  mockListPostgresUsersResponse,
  mockListSecretForAllResponse,
  mockListSecretForAppResponse,
  mockShowConfigResponse,
  mockStatusResponse,
  mockVersionResponse
} from './mocks';
import type { Config } from './types';

vi.mock('console');
vi.mock('fs', async () => ({
  // Only mock `existsSync`, `mkdirSync` and `writeFileSync`
  ...(await vi.importActual('fs')),
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn()
}));
vi.mock('os');
vi.mock('@codeware/shared/util/misc', async () => ({
  // Only mock `spawn` function
  ...(await vi.importActual('@codeware/shared/util/misc')),
  spawn: vi.fn(),
  spawnPty: vi.fn()
}));

describe('Fly', () => {
  /**
   * Whether to enable debug logging during test development.
   * Command mock details are printed to console.
   */
  const enableDebugLogging = false;

  const mockConsoleInfo = vi.spyOn(console, 'log');
  const mockConsoleError = vi.spyOn(console, 'error');

  if (!enableDebugLogging) {
    mockConsoleInfo.mockImplementation(() => vi.fn());
    mockConsoleError.mockImplementation(() => vi.fn());
  }

  /**
   * Mocked fly configuration for the tests
   * - logger is mocked
   * - token is provided
   */
  const mockFlyConfig: Config = {
    logger: {
      info: mockConsoleInfo as Mock,
      error: mockConsoleError as Mock,
      // Tip! Set to `true` to print mock details
      traceCLI: enableDebugLogging
    },
    token: mockDefs.token
  };

  const mockSpawn = vi.mocked(spawn);
  const mockSpawnPty = vi.mocked(spawnPty);
  const mockExistsSync = vi.mocked(existsSync);
  const mockMkdirSync = vi.mocked(mkdirSync);
  const mockWriteFileSync = vi.mocked(writeFileSync);

  /**
   * Assert that `spawn` was called with the given arguments.
   *
   * Match provided arguments exactly (`exact`), some should match (`some`)
   * or the call should not be made (`not`).
   *
   * Argument order is also validated.
   *
   * @param matchArgs - The matching strategy to use for the arguments
   * @param args - The arguments to check
   * @param options - Spawn and test options
   */
  const assertSpawn = (
    matchArgs: 'exact' | 'not' | 'some',
    args: Array<string>,
    options: ExecFlyOptions = { streamToConsole: false }
  ) => {
    // Determine which mock to use
    const mockSpawnUsed = options?.prompt ? mockSpawnPty : mockSpawn;

    // Check negative test first - ignore options
    if (matchArgs === 'not') {
      // Assert that the call was not made
      expect(mockSpawnUsed).not.toHaveBeenCalledWith(
        expect.stringMatching(/^fly/),
        expect.arrayContaining(args),
        expect.anything()
      );
      return;
    }

    // Find call that matches our arguments
    const matchingCall = mockSpawnUsed.mock.calls.find(
      (call) =>
        call[0].match(/^fly/) && args.every((arg) => call[1].includes(arg))
    );

    // Assert normally when a call could not be found.
    // It should fail but provide a better DX to the user.
    if (!matchingCall) {
      expect(mockSpawnUsed).toHaveBeenCalledWith(
        expect.stringMatching(/^fly/),
        expect.arrayContaining(args),
        options
      );
      // Type guard
      return;
    }

    // Analyze the call arguments
    const actualArgs = matchingCall[1];
    const actualOptions = matchingCall[2];
    switch (matchArgs) {
      case 'exact':
        expect(actualArgs).toEqual(args);
        expect(actualOptions).toEqual(options);
        break;
      case 'some': {
        // Otherwise, check that the arguments are defined in the correct order
        const actualArgsInUse = actualArgs.filter((arg) => args.includes(arg));
        expect(actualArgsInUse).toEqual(args);
        expect(actualOptions).toEqual(options);
        break;
      }
    }
  };

  /**
   * Setup mock implementations for Fly commands via `exec`.
   *
   * **Must be in sync with `mockDefs` to work correctly**
   *
   * A set of base rules are always applied and can be complemented
   * with additional custom rules for each test.
   *
   * The rules should match a fly command and decide whether to resolve
   * or reject the promise with the appropriate output.
   *
   * For commands that doesn't match a rule will return valid JSON for empty
   * output when `--json` flag is used with or without `list`.
   *
   * @param rules - The rules to apply to the mock execution
   */
  const setupFlyMocks = (
    rules: Array<{
      /** The matched fly command to mock (exclude `fly/flyctl` prefix) */
      cmdMatch: RegExp;
      /** Whether to resolve or reject the promise */
      resolveOrReject: 'resolve' | 'reject';
      /** The stdout or error message to return */
      output: string;
      /**
       * The number of times the rule can be applied.
       * For example 1 mimics `mockExec.mockImplementationOnce`.
       */
      calls?: number;
    }> = []
  ) => {
    // Base rules that are always applied
    const baseRules: typeof rules = [
      {
        cmdMatch: /auth whoami/,
        resolveOrReject: 'resolve', // Defaults to authenticated to fly.io
        output: 'user@example.com'
      },
      {
        cmdMatch: /status( --app new-app)? --json/,
        resolveOrReject: 'reject',
        output: 'App not found',
        calls: 1
      },
      {
        cmdMatch: /status --app new-app/,
        resolveOrReject: 'resolve',
        output: JSON.stringify(mockStatusResponse(mockDefs.newApp))
      },
      {
        cmdMatch: /status --app generated-name-app --json/,
        resolveOrReject: 'resolve',
        output: JSON.stringify(mockStatusResponse(mockDefs.generatedAppName))
      },
      {
        cmdMatch: /status (--app test-app|--config test\/fly\.toml)/,
        resolveOrReject: 'resolve',
        output: JSON.stringify(mockStatusResponse(mockDefs.testApp))
      },
      {
        cmdMatch: /apps create new-app/,
        resolveOrReject: 'resolve',
        output: JSON.stringify(mockCreateAppResponse(mockDefs.newApp))
      },
      {
        cmdMatch: /apps create --generate-name/,
        resolveOrReject: 'resolve',
        output: JSON.stringify(mockCreateAppResponse(mockDefs.generatedAppName))
      },
      {
        cmdMatch: /apps list/,
        resolveOrReject: 'resolve',
        output: JSON.stringify(mockAppsListResponse)
      },
      {
        cmdMatch: /status --app unknown-app/,
        resolveOrReject: 'reject',
        output: 'App not found'
      },
      {
        cmdMatch: /certs list --app .*/,
        resolveOrReject: 'resolve',
        output: JSON.stringify(mockListCertForAppResponse)
      },
      {
        cmdMatch: /config show (--app test-app|--config test\/fly\.toml)/,
        resolveOrReject: 'resolve',
        output: JSON.stringify(mockShowConfigResponse(mockDefs.testApp))
      },
      {
        cmdMatch: /config show --config new\/fly\.toml/,
        resolveOrReject: 'resolve',
        output: JSON.stringify(mockShowConfigResponse(mockDefs.newApp))
      },
      {
        cmdMatch: /config show --config unknown\/fly\.toml/,
        resolveOrReject: 'reject',
        output: 'Config not found'
      },
      {
        cmdMatch: /config save --app .*/,
        resolveOrReject: 'resolve',
        output: 'void'
      },
      {
        cmdMatch: /postgres (attach|detach) .* --app .* --yes/,
        resolveOrReject: 'resolve',
        output: 'void'
      },
      {
        cmdMatch: /postgres list --json/,
        resolveOrReject: 'resolve',
        output: JSON.stringify(mockListPostgresResponse)
      },
      {
        cmdMatch: /postgres users list --app db-app-attached/,
        resolveOrReject: 'resolve',
        output: JSON.stringify(mockListPostgresUsersResponse)
      },
      {
        cmdMatch: /postgres users list --app db-app-prestine/,
        resolveOrReject: 'resolve',
        output: JSON.stringify([])
      },
      {
        cmdMatch: /secrets list --app .*/,
        resolveOrReject: 'resolve',
        output: JSON.stringify(mockListSecretForAppResponse)
      },
      {
        cmdMatch: /version --json/,
        resolveOrReject: 'resolve',
        output: JSON.stringify(mockVersionResponse)
      }
    ];

    // Let user override base rules
    const allRules = [...rules, ...baseRules];

    // Mock spawn function with the rules
    mockSpawn.mockImplementation((_, args) => {
      // Find the rules that match the command (without `fly/flyctl` prefix)
      const cmd = args.join(' ');
      for (const rule of allRules.filter(
        (r) => r.calls !== 0 && cmd.match(r.cmdMatch)
      )) {
        if (mockFlyConfig?.logger?.traceCLI) {
          console.debug('[ MOCK ]', rule);
        }
        // Decrement the number of calls for the rule
        if (Number.isInteger(rule.calls) && rule.calls) {
          rule.calls--;
        }
        // Return the rule result
        return (
          rule.resolveOrReject === 'resolve'
            ? Promise.resolve({ stdout: rule.output, stderr: '' })
            : Promise.reject(new Error(rule.output))
        ) as ReturnType<typeof spawn>;
      }

      // Default JSON responses for empty results
      const response = {
        stdout: cmd.match(/.* list .* --json/)
          ? '[]'
          : cmd.match(/--json/)
            ? '{}'
            : '',
        stderr: ''
      };
      if (mockFlyConfig?.logger?.traceCLI) {
        console.debug('[ MOCK ]', response);
      }
      return Promise.resolve(response) as ReturnType<typeof spawn>;
    });
  };

  let origProcessEnv: typeof process.env;

  beforeAll(() => {
    // Save original process.env before the tests
    origProcessEnv = process.env;
  });

  afterAll(() => {
    process.env = origProcessEnv;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    setupFlyMocks();
  });

  describe('cli', () => {
    it('should check installed and return true when cli is installed', async () => {
      const fly = new Fly(mockFlyConfig);
      expect(await fly.cli.isInstalled()).toBe(true);
    });

    it('should check installed and return false when cli is not installed', async () => {
      setupFlyMocks([
        {
          cmdMatch: /version/,
          resolveOrReject: 'reject',
          output: 'not installed'
        }
      ]);
      const fly = new Fly(mockFlyConfig);
      expect(await fly.cli.isInstalled()).toBe(false);
    });
  });

  describe('initialization', () => {
    it('should not trace logs by default', async () => {
      const fly = new Fly();
      expect(fly['logger'].traceCLI).toBe(false);
    });

    it('should not debug logs by default', async () => {
      const fly = new Fly();
      expect(fly['logger'].debug).toBe(false);
      await fly.apps.list();
      assertSpawn('exact', ['apps', 'list', '--json']);
    });

    it('should not verbose logs by default', async () => {
      const fly = new Fly();
      expect(fly['logger'].verbose).toBe(false);
      await fly.apps.list();
      assertSpawn('exact', ['apps', 'list', '--json']);
    });

    it('should append debug flag to commands when enabled', async () => {
      const fly = new Fly({
        ...mockFlyConfig,
        logger: { ...mockFlyConfig.logger, debug: true }
      });
      await fly.apps.list();
      assertSpawn('some', ['--debug']);
    });

    it('should append verbose flag to commands when enabled', async () => {
      const fly = new Fly({
        ...mockFlyConfig,
        logger: { ...mockFlyConfig.logger, verbose: true }
      });
      await fly.apps.list();
      assertSpawn('some', ['--verbose']);
    });

    it('should set redact secrets to true by default', async () => {
      const fly = new Fly();
      expect(fly['logger'].redactSecrets).toBe(true);
    });

    it('should throw error when running command and fly is not installed', async () => {
      setupFlyMocks([
        {
          cmdMatch: /version/,
          resolveOrReject: 'reject',
          output: 'not installed',
          calls: 1
        }
      ]);

      const fly = new Fly(mockFlyConfig);
      await expect(async () => await fly.apps.create()).rejects.toThrow(
        /Fly CLI must be installed to use this library/
      );
    });

    it('should log the error and return false without assert option when fly is not ready', async () => {
      setupFlyMocks([
        {
          cmdMatch: /auth whoami/,
          resolveOrReject: 'reject',
          output: 'Not logged in'
        }
      ]);

      const fly = new Fly(mockFlyConfig);

      expect(async () => await fly.isReady()).not.toThrow();

      const status = await fly.isReady();

      expect(mockConsoleInfo).toHaveBeenCalledWith(
        expect.stringContaining('Fly client is not ready')
      );
      expect(mockConsoleInfo).not.toHaveBeenCalledWith(
        expect.stringContaining('Fly client is ready')
      );
      expect(status).toBe(false);
    });

    it('should throw error when fly is not verified with assert option', async () => {
      setupFlyMocks([
        {
          cmdMatch: /auth whoami/,
          resolveOrReject: 'reject',
          output: 'Not logged in'
        }
      ]);

      const fly = new Fly(mockFlyConfig);

      await expect(fly.isReady('assert')).rejects.toThrow(/Not logged in/);
      expect(mockConsoleInfo).not.toHaveBeenCalledWith(
        expect.stringContaining('Fly client is ready')
      );
      expect(mockConsoleInfo).not.toHaveBeenCalledWith(
        expect.stringContaining('Fly client is not ready')
      );
    });

    it('should check authentication before invoking a command', async () => {
      const fly = new Fly(mockFlyConfig);
      const status = await fly.isReady();

      assertSpawn('exact', ['auth', 'whoami']);
      expect(status).toBe(true);
    });

    it('should set FLY_ACCESS_TOKEN with token from config when provided', async () => {
      delete process.env['FLY_ACCESS_TOKEN'];

      const fly = new Fly({ ...mockFlyConfig, token: 'api-token' });

      expect(fly).toBeDefined();
      expect(process.env['FLY_ACCESS_TOKEN']).toBe('api-token');
    });
  });

  // This test suite ensures that the type `AppOrConfig` is correctly handled
  // by the constructor and the functions that use it.
  // The type enforce usage of only one of `app` or `config` to be provided.
  // When used in the constructor all functions should infer `app` or `config`
  // from the constructor unless overridden by the function itself.
  describe('provide app or config to constructor or function', () => {
    const testMatrix: Array<{
      name: string;
      noOptionFn: (fly: typeof Fly.prototype) => Promise<unknown>;
      appOptionFn: (fly: typeof Fly.prototype) => Promise<unknown>;
      configOptionFn: (fly: typeof Fly.prototype) => Promise<unknown>;
      expectAppCmdArgs: Array<string>;
      expectConfigCmdArgs: Array<string>;
    }> = [
      {
        name: 'certs.add',
        noOptionFn: async (fly) => fly.certs.add('test.com'),
        appOptionFn: async (fly) =>
          fly.certs.add('test.com', { app: mockDefs.testApp }),
        configOptionFn: async (fly) =>
          fly.certs.add('test.com', { config: mockDefs.testConfig }),
        expectAppCmdArgs: [
          'certs',
          'add',
          'test.com',
          '--app',
          mockDefs.testApp,
          '--json'
        ],
        expectConfigCmdArgs: [
          'certs',
          'add',
          'test.com',
          '--config',
          mockDefs.testConfig,
          '--json'
        ]
      },
      {
        name: 'certs.list',
        noOptionFn: async (fly) => fly.certs.list(),
        appOptionFn: async (fly) => fly.certs.list({ app: mockDefs.testApp }),
        configOptionFn: async (fly) =>
          fly.certs.list({ config: mockDefs.testConfig }),
        expectAppCmdArgs: [
          'certs',
          'list',
          '--app',
          mockDefs.testApp,
          '--json'
        ],
        expectConfigCmdArgs: [
          'certs',
          'list',
          '--config',
          mockDefs.testConfig,
          '--json'
        ]
      },
      {
        name: 'certs.remove',
        noOptionFn: async (fly) => fly.certs.remove('test.com'),
        appOptionFn: async (fly) =>
          fly.certs.remove('test.com', { app: mockDefs.testApp }),
        configOptionFn: async (fly) =>
          fly.certs.remove('test.com', { config: mockDefs.testConfig }),
        expectAppCmdArgs: [
          'certs',
          'remove',
          'test.com',
          '--app',
          mockDefs.testApp,
          '--yes'
        ],
        expectConfigCmdArgs: [
          'certs',
          'remove',
          'test.com',
          '--config',
          mockDefs.testConfig,
          '--yes'
        ]
      },
      {
        name: 'config.show',
        noOptionFn: async (fly) => fly.config.show(),
        appOptionFn: async (fly) => fly.config.show({ app: mockDefs.testApp }),
        configOptionFn: async (fly) =>
          fly.config.show({ config: mockDefs.testConfig }),
        expectAppCmdArgs: ['config', 'show', '--app', mockDefs.testApp],
        expectConfigCmdArgs: ['config', 'show', '--config', mockDefs.testConfig]
      },
      {
        name: 'secrets.set',
        noOptionFn: async (fly) => fly.secrets.set({ TEST_SECRET: 'value' }),
        appOptionFn: async (fly) =>
          fly.secrets.set({ TEST_SECRET: 'value' }, { app: mockDefs.testApp }),
        configOptionFn: async (fly) =>
          fly.secrets.set(
            { TEST_SECRET: 'value' },
            { config: mockDefs.testConfig }
          ),
        expectAppCmdArgs: [
          'secrets',
          'set',
          '--app',
          mockDefs.testApp,
          'TEST_SECRET=value'
        ],
        expectConfigCmdArgs: [
          'secrets',
          'set',
          '--config',
          mockDefs.testConfig,
          'TEST_SECRET=value'
        ]
      },
      {
        name: 'secrets.list',
        noOptionFn: async (fly) => fly.secrets.list(),
        appOptionFn: async (fly) => fly.secrets.list({ app: mockDefs.testApp }),
        configOptionFn: async (fly) =>
          fly.secrets.list({ config: mockDefs.testConfig }),
        expectAppCmdArgs: [
          'secrets',
          'list',
          '--app',
          mockDefs.testApp,
          '--json'
        ],
        expectConfigCmdArgs: [
          'secrets',
          'list',
          '--config',
          mockDefs.testConfig,
          '--json'
        ]
      },
      {
        name: 'secrets.unset',
        noOptionFn: async (fly) => fly.secrets.unset('TEST_SECRET'),
        appOptionFn: async (fly) =>
          fly.secrets.unset('TEST_SECRET', { app: mockDefs.testApp }),
        configOptionFn: async (fly) =>
          fly.secrets.unset('TEST_SECRET', { config: mockDefs.testConfig }),
        expectAppCmdArgs: [
          'secrets',
          'unset',
          '--app',
          mockDefs.testApp,
          'TEST_SECRET'
        ],
        expectConfigCmdArgs: [
          'secrets',
          'unset',
          '--config',
          mockDefs.testConfig,
          'TEST_SECRET'
        ]
      },
      {
        name: 'status',
        noOptionFn: async (fly) => fly.status(),
        appOptionFn: async (fly) => fly.status({ app: mockDefs.testApp }),
        configOptionFn: async (fly) =>
          fly.status({ config: mockDefs.testConfig }),
        expectAppCmdArgs: ['status', '--app', mockDefs.testApp, '--json'],
        expectConfigCmdArgs: [
          'status',
          '--config',
          mockDefs.testConfig,
          '--json'
        ]
      },
      {
        name: 'statusExtended - certs',
        noOptionFn: async (fly) => fly.statusExtended(),
        appOptionFn: async (fly) =>
          fly.statusExtended({ app: mockDefs.testApp }),
        configOptionFn: async (fly) =>
          fly.statusExtended({ config: mockDefs.testConfig }),
        expectAppCmdArgs: [
          'certs',
          'list',
          '--app',
          mockDefs.testApp,
          '--json'
        ],
        expectConfigCmdArgs: [
          'certs',
          'list',
          '--config',
          mockDefs.testConfig,
          '--json'
        ]
      },
      {
        name: 'statusExtended - secrets',
        noOptionFn: async (fly) => fly.statusExtended(),
        appOptionFn: async (fly) =>
          fly.statusExtended({ app: mockDefs.testApp }),
        configOptionFn: async (fly) =>
          fly.statusExtended({ config: mockDefs.testConfig }),
        expectAppCmdArgs: [
          'secrets',
          'list',
          '--app',
          mockDefs.testApp,
          '--json'
        ],
        expectConfigCmdArgs: [
          'secrets',
          'list',
          '--config',
          mockDefs.testConfig,
          '--json'
        ]
      }
    ];

    for (const test of testMatrix) {
      describe(test.name, () => {
        it('should have --app flag when app is provided to constructor', async () => {
          const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
          await test.noOptionFn(fly);
          assertSpawn('exact', test.expectAppCmdArgs);
        });

        it('should have --app flag when app is provided to function', async () => {
          const fly = new Fly(mockFlyConfig);
          await test.appOptionFn(fly);
          assertSpawn('exact', test.expectAppCmdArgs);
        });

        it('should have --config flag when config is provided to constructor', async () => {
          const fly = new Fly({
            ...mockFlyConfig,
            config: mockDefs.testConfig
          });
          await test.noOptionFn(fly);
          assertSpawn('exact', test.expectConfigCmdArgs);
        });

        it('should have --config flag when config is provided to function', async () => {
          const fly = new Fly(mockFlyConfig);
          await test.configOptionFn(fly);
          assertSpawn('exact', test.expectConfigCmdArgs);
        });
      });
    }
  });

  describe('apps', () => {
    it('should create application on personal organization with a generated name by default', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.apps.create();

      assertSpawn('exact', [
        'apps',
        'create',
        '--generate-name',
        '--org',
        'personal',
        '--json'
      ]);
    });

    it('should create application with a provided name', async () => {
      const fly = new Fly(mockFlyConfig);
      const { name } = await fly.apps.create({ app: mockDefs.newApp });

      expect(name).toBe(mockDefs.newApp);
      assertSpawn('exact', [
        'apps',
        'create',
        mockDefs.newApp,
        '--org',
        'personal',
        '--json'
      ]);
    });

    it('should create application for a custom organization', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.apps.create({ org: mockDefs.org });

      assertSpawn('exact', [
        'apps',
        'create',
        '--generate-name',
        '--org',
        mockDefs.org,
        '--json'
      ]);
    });

    it('should destroy application', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.apps.destroy(mockDefs.testApp);

      assertSpawn('exact', ['apps', 'destroy', mockDefs.testApp, '--yes']);
    });

    it('should auto-confirm destruction', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.apps.destroy(mockDefs.testApp);

      assertSpawn('exact', ['apps', 'destroy', mockDefs.testApp, '--yes']);
    });

    it('should detach from postgres cluster when app is attached', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.apps.destroy(mockDefs.testApp);

      assertSpawn(
        'exact',
        [
          'postgres',
          'detach',
          mockDefs.postgresAttached,
          '--app',
          mockDefs.testApp
        ],
        { prompt: expect.any(Function) }
      );
    });

    it('should not detach from postgres cluster when app is not attached', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.apps.destroy(mockDefs.newApp);

      assertSpawn('not', ['postgres', 'detach']);
    });

    it('should list applications', async () => {
      const fly = new Fly(mockFlyConfig);
      const response = await fly.apps.list();

      assertSpawn('exact', ['apps', 'list', '--json']);
      expect(response).toEqual(mockAppsListResponse);
    });
  });

  describe('certs', () => {
    // Note! `certs list` is already tested in the extensive test matrix
    it('should add certificate', async () => {
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      await fly.certs.add('test.com');

      assertSpawn('exact', [
        'certs',
        'add',
        'test.com',
        '--app',
        mockDefs.testApp,
        '--json'
      ]);
    });

    it('should remove certificate', async () => {
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      await fly.certs.remove('test.com');

      assertSpawn('exact', [
        'certs',
        'remove',
        'test.com',
        '--app',
        mockDefs.testApp,
        '--yes'
      ]);
    });

    it('should auto-confirm removal', async () => {
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      await fly.certs.remove('test.com');

      assertSpawn('exact', [
        'certs',
        'remove',
        'test.com',
        '--app',
        mockDefs.testApp,
        '--yes'
      ]);
    });

    it('should list certificates for instance app', async () => {
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      const response = await fly.certs.list();

      assertSpawn('exact', [
        'certs',
        'list',
        '--app',
        mockDefs.testApp,
        '--json'
      ]);
      expect(response).toEqual(mockListCertForAppResponse);
    });

    it('should list certificates for an app', async () => {
      const fly = new Fly(mockFlyConfig);
      const response = await fly.certs.list({ app: mockDefs.testApp });

      assertSpawn('exact', [
        'certs',
        'list',
        '--app',
        mockDefs.testApp,
        '--json'
      ]);
      expect(response).toEqual(mockListCertForAppResponse);
    });

    it('should list certificates for all apps', async () => {
      const fly = new Fly(mockFlyConfig);
      const response = await fly.certs.list('all');

      assertSpawn('exact', [
        'certs',
        'list',
        '--app',
        mockListCertForAllResponse[0].app,
        '--json'
      ]);
      assertSpawn('exact', [
        'certs',
        'list',
        '--app',
        mockListCertForAllResponse[1].app,
        '--json'
      ]);
      expect(response).toEqual(mockListCertForAllResponse);
    });
  });

  describe('ips', () => {
    // The defect this exists for: an app with no address deploys green and
    // answers nothing, so the allocation has to be driven by us
    it('should allocate both addresses when the app has none', async () => {
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      await fly.ips.ensure();

      assertSpawn('exact', [
        'ips',
        'allocate-v4',
        '--shared',
        '--app',
        mockDefs.testApp,
        '--yes'
      ]);
      assertSpawn('exact', ['ips', 'allocate-v6', '--app', mockDefs.testApp]);
    });

    // `allocate-v6` has no such flag and fails with `unknown flag: --yes`,
    // while `allocate-v4` needs it because a dedicated v4 prompts. The
    // asymmetry looks like an oversight and gets tidied away without this
    it('should not auto-confirm the v6 allocation', async () => {
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      await fly.ips.ensure();

      const v6Call = mockSpawn.mock.calls.find((call) =>
        call[1].includes('allocate-v6')
      );

      expect(v6Call?.[1]).not.toContain('--yes');
      expect(v6Call?.[1]).not.toContain('--auto-confirm');
    });

    // Runs on every deploy, not only on create, so it has to be a no-op for
    // the apps that already hold their addresses
    it('should allocate nothing when the app already has both', async () => {
      setupFlyMocks([
        {
          cmdMatch: /ips list --app .*/,
          resolveOrReject: 'resolve',
          output: JSON.stringify(mockListIpResponse)
        }
      ]);
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      await fly.ips.ensure();

      assertSpawn('not', ['ips', 'allocate-v4']);
      assertSpawn('not', ['ips', 'allocate-v6']);
    });

    it('should allocate only what is missing', async () => {
      setupFlyMocks([
        {
          cmdMatch: /ips list --app .*/,
          resolveOrReject: 'resolve',
          output: JSON.stringify(
            mockListIpResponse.filter((ip) => ip.type === 'v6')
          )
        }
      ]);
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      await fly.ips.ensure();

      assertSpawn('some', ['ips', 'allocate-v4', '--shared']);
      assertSpawn('not', ['ips', 'allocate-v6']);
    });

    // A dedicated v4 is billed, so the flag is not optional
    it('should never request a dedicated v4', async () => {
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      await fly.ips.ensure();

      const v4Call = mockSpawn.mock.calls.find((call) =>
        call[1].includes('allocate-v4')
      );
      expect(v4Call?.[1]).toContain('--shared');
    });

    it('should accept a dedicated v4 as satisfying the v4 need', async () => {
      setupFlyMocks([
        {
          cmdMatch: /ips list --app .*/,
          resolveOrReject: 'resolve',
          output: JSON.stringify([
            { ...mockListIpResponse[1], type: 'v4', address: '1.2.3.4' }
          ])
        }
      ]);
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      await fly.ips.ensure();

      assertSpawn('not', ['ips', 'allocate-v4']);
      assertSpawn('some', ['ips', 'allocate-v6']);
    });

    it('should list the addresses an app holds', async () => {
      setupFlyMocks([
        {
          cmdMatch: /ips list --app .*/,
          resolveOrReject: 'resolve',
          output: JSON.stringify(mockListIpResponse)
        }
      ]);
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });

      await expect(fly.ips.list()).resolves.toEqual(mockListIpResponse);
    });

    // Fly answers in PascalCase; the raw shape has to survive the transform
    it('should read the raw PascalCase response', async () => {
      setupFlyMocks([
        {
          cmdMatch: /ips list --app .*/,
          resolveOrReject: 'resolve',
          output: JSON.stringify([
            {
              ID: '',
              Address: '66.241.125.38',
              Type: 'shared_v4',
              Region: '',
              CreatedAt: '0001-01-01T00:00:00Z'
            }
          ])
        }
      ]);
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });

      await expect(fly.ips.list()).resolves.toEqual([
        {
          id: '',
          address: '66.241.125.38',
          type: 'shared_v4',
          region: '',
          createdAt: '0001-01-01T00:00:00Z'
        }
      ]);
    });
  });

  describe('config', () => {
    it('should show config for instance config', async () => {
      const fly = new Fly({ ...mockFlyConfig, config: mockDefs.testConfig });
      const response = await fly.config.show();

      assertSpawn('exact', ['config', 'show', '--config', mockDefs.testConfig]);
      expect(response).toEqual(mockShowConfigResponse(mockDefs.testApp));
    });

    it('should show config for an app', async () => {
      const fly = new Fly(mockFlyConfig);
      const response = await fly.config.show({ config: mockDefs.testConfig });

      assertSpawn('exact', ['config', 'show', '--config', mockDefs.testConfig]);
      expect(response).toEqual(mockShowConfigResponse(mockDefs.testApp));
    });

    it('should show config for local config file', async () => {
      const fly = new Fly(mockFlyConfig);
      const response = await fly.config.show({
        config: mockDefs.testConfig,
        local: true
      });

      assertSpawn('exact', [
        'config',
        'show',
        '--config',
        mockDefs.testConfig,
        '--local'
      ]);
      expect(response).toEqual(mockShowConfigResponse(mockDefs.testApp));
    });

    it('should throw error when command fails', async () => {
      const fly = new Fly(mockFlyConfig);
      await expect(
        fly.config.show({ config: mockDefs.unknownConfig })
      ).rejects.toThrow();
    });

    it('should throw error when local config file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const fly = new Fly(mockFlyConfig);
      await expect(
        fly.config.show({ config: mockDefs.unknownConfig, local: true })
      ).rejects.toThrow(
        `Config file '${mockDefs.unknownConfig}' does not exist`
      );
    });

    it('should save remote config to local file', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.config.save({
        app: mockDefs.testApp,
        config: 'fly.remote.toml'
      });

      assertSpawn('exact', [
        'config',
        'save',
        '--app',
        mockDefs.testApp,
        '--config',
        'fly.remote.toml',
        '--yes'
      ]);
    });

    it('should request json output for a .json config path', async () => {
      // flyctl stopped inferring the output format from the path's
      // extension — this is what makes a `.json` path still work
      const fly = new Fly(mockFlyConfig);
      await fly.config.save({
        app: mockDefs.testApp,
        config: 'fly.remote.json'
      });

      assertSpawn('exact', [
        'config',
        'save',
        '--app',
        mockDefs.testApp,
        '--config',
        'fly.remote.json',
        '--json',
        '--yes'
      ]);
    });

    it('should request yaml output for a .yaml config path', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.config.save({
        app: mockDefs.testApp,
        config: 'fly.remote.yaml'
      });

      assertSpawn('exact', [
        'config',
        'save',
        '--app',
        mockDefs.testApp,
        '--config',
        'fly.remote.yaml',
        '--yaml',
        '--yes'
      ]);
    });

    it('seeds a parseable file before saving, since flyctl refuses to write to a path that is not already there', async () => {
      mockExistsSync.mockReturnValue(false);

      const fly = new Fly(mockFlyConfig);
      await fly.config.save({
        app: mockDefs.testApp,
        config: 'new/fly.remote.json'
      });

      expect(mockMkdirSync).toHaveBeenCalledWith('new', { recursive: true });
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        'new/fly.remote.json',
        '{}'
      );
    });

    it('does not overwrite a config that is already there', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.config.save({
        app: mockDefs.testApp,
        config: 'fly.remote.toml'
      });

      expect(mockMkdirSync).not.toHaveBeenCalled();
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });
  });

  describe('deploy', () => {
    it('should require config', async () => {
      const fly = new Fly(mockFlyConfig);
      await expect(fly.deploy({ app: mockDefs.newApp })).rejects.toThrow(
        'Fly config file must be provided to options or class instance, unable to deploy'
      );
    });

    it('should accept config from class instance', async () => {
      const fly = new Fly({ ...mockFlyConfig, config: mockDefs.testConfig });
      await expect(fly.deploy({ app: mockDefs.newApp })).resolves.not.toThrow();
    });

    it('should accept config from options', async () => {
      const fly = new Fly(mockFlyConfig);
      await expect(
        fly.deploy({ app: mockDefs.newApp, config: mockDefs.testConfig })
      ).resolves.not.toThrow();
    });

    it('should throw error when config does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const fly = new Fly(mockFlyConfig);
      await expect(
        fly.deploy({ app: mockDefs.newApp, config: mockDefs.testConfig })
      ).rejects.toThrow(`Config file '${mockDefs.testConfig}' does not exist`);
    });

    it('should create new app when it does not exist', async () => {
      const fly = new Fly(mockFlyConfig);
      const response = await fly.deploy({
        app: mockDefs.newApp,
        config: mockDefs.testConfig,
        org: mockDefs.org
      });

      assertSpawn('exact', [
        'apps',
        'create',
        mockDefs.newApp,
        '--org',
        mockDefs.org,
        '--json'
      ]);
      expect(response).toEqual({
        app: mockDefs.newApp,
        hostname: `${mockDefs.newApp}.fly.dev`,
        url: `https://${mockDefs.newApp}.fly.dev`
      });
    });

    it('should not blank a secret whose value is empty', async () => {
      const fly = new Fly(mockFlyConfig);

      // `KEY=${{ secrets.RENAMED }}` renders as `KEY=`, and an app already
      // running with a good value must keep it
      await fly.deploy({
        app: mockDefs.testApp,
        config: mockDefs.testConfig,
        secrets: { [mockDefs.testSecret]: '', NEW_SECRET: 'value' }
      });

      assertSpawn('exact', [
        'secrets',
        'set',
        '--app',
        mockDefs.testApp,
        '--stage',
        'NEW_SECRET=value'
      ]);
    });

    it('should not list secrets when deploying', async () => {
      const fly = new Fly(mockFlyConfig);

      // The listing only ever told the deploy which secrets to skip. Nothing
      // is skipped now, so an existing app costs one api call less
      await fly.deploy({
        app: mockDefs.testApp,
        config: mockDefs.testConfig,
        secrets: { NEW_SECRET: 'value' }
      });

      assertSpawn('not', ['secrets', 'list']);
    });

    it('should attach to postgres cluster when not attached to the app', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.deploy({
        app: mockDefs.testApp,
        config: mockDefs.testConfig,
        postgres: mockDefs.postgresNotAttached
      });

      assertSpawn('exact', [
        'postgres',
        'attach',
        mockDefs.postgresNotAttached,
        '--app',
        mockDefs.testApp,
        '--yes'
      ]);
    });

    it('should attach to postgres cluster with database name when provided', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.deploy({
        app: mockDefs.testApp,
        config: mockDefs.testConfig,
        postgres: mockDefs.postgresNotAttached,
        databaseName: 'shared_db_name'
      });

      assertSpawn('exact', [
        'postgres',
        'attach',
        mockDefs.postgresNotAttached,
        '--app',
        mockDefs.testApp,
        '--database-name',
        'shared_db_name',
        '--yes'
      ]);
    });

    it('should not attach to postgres cluster when already attached', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.deploy({
        app: mockDefs.testApp,
        config: mockDefs.testConfig,
        postgres: mockDefs.postgresAttached
      });

      assertSpawn('not', ['postgres', 'attach']);
    });

    it('should not attach to postgres cluster when already attached even with database name', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.deploy({
        app: mockDefs.testApp,
        config: mockDefs.testConfig,
        postgres: mockDefs.postgresAttached,
        databaseName: 'shared_db_name'
      });

      assertSpawn('not', ['postgres', 'attach']);
    });

    it('should not automatically deploy when secrets are set for the app', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.deploy({
        app: mockDefs.testApp,
        config: mockDefs.testConfig,
        secrets: { NEW_SECRET: 'value' }
      });

      assertSpawn('exact', [
        'secrets',
        'set',
        '--app',
        mockDefs.testApp,
        '--stage',
        'NEW_SECRET=value'
      ]);
    });

    it('should stage a changed secret as well as a new one', async () => {
      const fly = new Fly(mockFlyConfig);

      // The app already holds `testSecret`. A deploy that set only what was
      // missing would strand a rotated value in the store it came from, which
      // is the whole of COD-426
      await fly.deploy({
        app: mockDefs.testApp,
        config: mockDefs.testConfig,
        secrets: {
          [mockDefs.testSecret]: 'new-value',
          NEW_SECRET: 'value'
        }
      });

      assertSpawn('exact', [
        'secrets',
        'set',
        '--app',
        mockDefs.testApp,
        '--stage',
        `${mockDefs.testSecret}=new-value`,
        'NEW_SECRET=value'
      ]);
    });

    it('should create app with name from provided config file and deploy with the same config', async () => {
      const fly = new Fly(mockFlyConfig);
      const response = await fly.deploy({
        config: mockDefs.newConfig
      });

      assertSpawn('exact', [
        'apps',
        'create',
        mockDefs.newApp,
        '--org',
        'personal',
        '--json'
      ]);
      assertSpawn('exact', [
        'deploy',
        '--app',
        mockDefs.newApp,
        '--config',
        mockDefs.newConfig,
        '--yes'
      ]);
      expect(response).toEqual({
        app: mockDefs.newApp,
        hostname: `${mockDefs.newApp}.fly.dev`,
        url: `https://${mockDefs.newApp}.fly.dev`
      });
    });

    it('should create app with provided name and deploy with existing config', async () => {
      const fly = new Fly(mockFlyConfig);
      const response = await fly.deploy({
        app: mockDefs.newApp,
        config: mockDefs.testConfig
      });

      assertSpawn('exact', [
        'apps',
        'create',
        mockDefs.newApp,
        '--org',
        'personal',
        '--json'
      ]);
      assertSpawn('exact', [
        'deploy',
        '--app',
        mockDefs.newApp,
        '--config',
        mockDefs.testConfig,
        '--yes'
      ]);
      expect(response).toEqual({
        app: mockDefs.newApp,
        hostname: `${mockDefs.newApp}.fly.dev`,
        url: `https://${mockDefs.newApp}.fly.dev`
      });
    });

    it('should deploy to custom region', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.deploy({
        app: mockDefs.testApp,
        config: mockDefs.testConfig,
        region: 'eu'
      });

      assertSpawn('exact', [
        'deploy',
        '--app',
        mockDefs.testApp,
        '--config',
        mockDefs.testConfig,
        '--region',
        'eu',
        '--yes'
      ]);
    });

    it('should set DEPLOY_ENV to environment', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.deploy({
        app: mockDefs.testApp,
        config: mockDefs.testConfig,
        environment: 'production'
      });

      assertSpawn('exact', [
        'deploy',
        '--app',
        mockDefs.testApp,
        '--config',
        mockDefs.testConfig,
        '--env',
        'DEPLOY_ENV=production',
        '--yes'
      ]);
    });

    it('should set environment variables', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.deploy({
        app: mockDefs.testApp,
        config: mockDefs.testConfig,
        env: {
          TEST_ENV: 'value',
          WITH_BACKSLASH: 'value\\with\\backslash',
          WITH_SPACE: 'value with space'
        }
      });

      assertSpawn('exact', [
        'deploy',
        '--app',
        mockDefs.testApp,
        '--config',
        mockDefs.testConfig,
        '--env',
        'TEST_ENV=value',
        '--env',
        'WITH_BACKSLASH=value\\\\with\\\\backslash',
        '--env',
        'WITH_SPACE=value\\ with\\ space',
        '--yes'
      ]);
    });

    it('should set build arguments', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.deploy({
        app: mockDefs.testApp,
        config: mockDefs.testConfig,
        buildArgs: {
          NEXT_PUBLIC_API_URL: 'https://api.example.com',
          SENTRY_DSN: 'https://key@sentry.io/project',
          BUILD_ID: 'abc123'
        }
      });

      assertSpawn('exact', [
        'deploy',
        '--app',
        mockDefs.testApp,
        '--config',
        mockDefs.testConfig,
        '--build-arg',
        'NEXT_PUBLIC_API_URL=https://api.example.com',
        '--build-arg',
        'SENTRY_DSN=https://key@sentry.io/project',
        '--build-arg',
        'BUILD_ID=abc123',
        '--yes'
      ]);
    });

    it('should opt out of depot builder', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.deploy({
        app: mockDefs.testApp,
        config: mockDefs.testConfig,
        optOutDepotBuilder: true
      });

      assertSpawn('exact', [
        'deploy',
        '--app',
        mockDefs.testApp,
        '--config',
        mockDefs.testConfig,
        '--depot=false',
        '--yes'
      ]);
    });

    it('should auto-confirm deployment', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.deploy({
        app: mockDefs.testApp,
        config: mockDefs.testConfig
      });

      assertSpawn('exact', [
        'deploy',
        '--app',
        mockDefs.testApp,
        '--config',
        mockDefs.testConfig,
        '--yes'
      ]);
    });

    it('should save remote config and use it when preferRemoteConfig is true and app exists', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.deploy({
        app: mockDefs.testApp,
        config: mockDefs.testConfig,
        preferRemoteConfig: true
      });

      // Should save remote config first
      assertSpawn('exact', [
        'config',
        'save',
        '--app',
        mockDefs.testApp,
        '--config',
        `test/fly.${mockDefs.testApp}.toml`,
        '--yes'
      ]);

      // Then deploy with the remote config
      assertSpawn('exact', [
        'deploy',
        '--app',
        mockDefs.testApp,
        '--config',
        `test/fly.${mockDefs.testApp}.toml`,
        '--yes'
      ]);
    });

    it('should use local config when preferRemoteConfig is true but app does not exist', async () => {
      const fly = new Fly(mockFlyConfig);
      await fly.deploy({
        app: mockDefs.newApp,
        config: mockDefs.testConfig,
        preferRemoteConfig: true
      });

      // Should not save remote config for new app
      assertSpawn('not', ['config', 'save']);

      // Should deploy with local config
      assertSpawn('exact', [
        'deploy',
        '--app',
        mockDefs.newApp,
        '--config',
        mockDefs.testConfig,
        '--yes'
      ]);
    });

    it('should fallback to local config if remote save fails when preferRemoteConfig is true', async () => {
      // Mock config save to fail
      setupFlyMocks([
        {
          cmdMatch: /config save --app test-app/,
          resolveOrReject: 'reject',
          output: 'Failed to save remote config',
          calls: 1
        }
      ]);

      const fly = new Fly(mockFlyConfig);
      await fly.deploy({
        app: mockDefs.testApp,
        config: mockDefs.testConfig,
        preferRemoteConfig: true
      });

      // Should attempt to save remote config
      assertSpawn('some', ['config', 'save']);

      // Should deploy with local config as fallback
      assertSpawn('exact', [
        'deploy',
        '--app',
        mockDefs.testApp,
        '--config',
        mockDefs.testConfig,
        '--yes'
      ]);
    });
  });

  describe('secrets', () => {
    // Note! `secrets list` is already tested in the extensive test matrix
    it('should set secret and auto-deploy', async () => {
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      await fly.secrets.set({ TEST_SECRET: 'value' });

      assertSpawn('exact', [
        'secrets',
        'set',
        '--app',
        mockDefs.testApp,
        'TEST_SECRET=value'
      ]);
    });

    it('should set secret and skip deployment', async () => {
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      await fly.secrets.set({ TEST_SECRET: 'value' }, { stage: true });

      assertSpawn('exact', [
        'secrets',
        'set',
        '--app',
        mockDefs.testApp,
        '--stage',
        'TEST_SECRET=value'
      ]);
    });

    it('should set secret with spaces in value', async () => {
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      await fly.secrets.set({ TEST_SECRET: 'value with space' });

      assertSpawn('exact', [
        'secrets',
        'set',
        '--app',
        mockDefs.testApp,
        'TEST_SECRET=value\\ with\\ space'
      ]);
    });

    it('should unset secret and auto-deploy', async () => {
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      await fly.secrets.unset('TEST_SECRET');

      assertSpawn('exact', [
        'secrets',
        'unset',
        '--app',
        mockDefs.testApp,
        'TEST_SECRET'
      ]);
    });

    it('should unset secret and skip deployment', async () => {
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      await fly.secrets.unset('TEST_SECRET', { stage: true });

      assertSpawn('exact', [
        'secrets',
        'unset',
        '--app',
        mockDefs.testApp,
        '--stage',
        'TEST_SECRET'
      ]);
    });

    it('should list secrets for instance app', async () => {
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      const response = await fly.secrets.list();

      assertSpawn('exact', [
        'secrets',
        'list',
        '--app',
        mockDefs.testApp,
        '--json'
      ]);
      expect(response).toEqual(mockListSecretForAppResponse);
    });

    it('should list secrets for an app', async () => {
      const fly = new Fly(mockFlyConfig);
      const response = await fly.secrets.list({ app: mockDefs.testApp });

      assertSpawn('exact', [
        'secrets',
        'list',
        '--app',
        mockDefs.testApp,
        '--json'
      ]);
      expect(response).toEqual(mockListSecretForAppResponse);
    });

    it('should list secrets for all apps', async () => {
      const fly = new Fly(mockFlyConfig);
      const response = await fly.secrets.list('all');

      assertSpawn('exact', ['apps', 'list', '--json']);
      assertSpawn('exact', [
        'secrets',
        'list',
        '--app',
        mockListSecretForAllResponse[0].app,
        '--json'
      ]);
      assertSpawn('exact', [
        'secrets',
        'list',
        '--app',
        mockListSecretForAllResponse[1].app,
        '--json'
      ]);
      expect(response).toEqual(mockListSecretForAllResponse);
    });
  });

  describe('status', () => {
    it('should return status object', async () => {
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      const status = await fly.status();

      expect(status).toEqual(mockStatusResponse(mockDefs.testApp));
    });

    it('should return status null when app does not exist', async () => {
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.unknownApp });
      const status = await fly.status();

      expect(status).toBeNull();
    });
  });

  describe('statusExtended', () => {
    it('should return status object with domains and secrets', async () => {
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.testApp });
      const status = await fly.statusExtended();

      expect(status).toEqual({
        ...mockStatusResponse(mockDefs.testApp),
        domains: expect.any(Array),
        secrets: expect.any(Array)
      });
    });

    it('should return null when app does not exist', async () => {
      const fly = new Fly({ ...mockFlyConfig, app: mockDefs.unknownApp });
      const status = await fly.statusExtended();

      expect(status).toBeNull();
    });
  });
});
