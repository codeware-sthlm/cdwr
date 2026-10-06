import type { ReplaceInFileConfig } from 'replace-in-file';

import { runMigration } from './run-migration';
import type { MigrateConfig } from './types';

// Capture all exec calls
type ExecCall = { cmd: string; args?: string[]; options?: any };

const execCalls: ExecCall[] = [];
// Allow a test to fail the format command
let formatFails = false;
// Allow a test to fail the sync command
let syncFails = false;

// Mock log functions
const infoMock = vi.fn();
const debugMock = vi.fn();
const warningMock = vi.fn();
vi.mock('@actions/core', () => ({
  info: (args: any[]) => infoMock(args),
  debug: (args: any[]) => debugMock(args),
  warning: (args: any[]) => warningMock(args)
}));

// Mock exec to capture calls
vi.mock('@actions/exec', () => ({
  exec: (cmd: string, args?: string[], options?: any) => {
    // Track all calls
    execCalls.push({ cmd, args, options });

    if (formatFails && args?.includes('format:write')) {
      return Promise.reject(new Error('prettier exploded'));
    }

    if (syncFails && args?.includes('sync')) {
      return Promise.reject(new Error('sync generator exploded'));
    }

    // Should always be successful
    return Promise.resolve(0);
  }
}));

// Mock a predictable package manager command
const packageManager = 'pnpm' as const;
vi.mock('@nx/devkit', () => ({
  getPackageManagerCommand: () => ({
    exec: packageManager,
    install: `${packageManager} install`
  })
}));

// Mock replaceInFile
const replaceInFileMock = vi.fn();
vi.mock('replace-in-file', () => ({
  default: (args: any[]) => replaceInFileMock(args)
}));

// Mock updateDependencies returning latest version for Nx devkit to prove it was called
const updateDependenciesMock = vi.fn((text: string, latest: string) => {
  if (text.includes('"@nx/devkit"')) {
    return text.replace(
      '"@nx/devkit": "^21.0.0"',
      `"@nx/devkit": "^${latest}"`
    );
  }
  return text;
});
vi.mock('./update-dependencies', () => ({
  updateDependencies: (text: string, latest: string) =>
    updateDependenciesMock(text, latest)
}));

// Mock deferred prompts lookup, no prompt migrations by default
const readDeferredPromptsMock = vi.fn(() => [] as Array<unknown>);
vi.mock('./read-deferred-prompts', () => ({
  readDeferredPrompts: () => readDeferredPromptsMock()
}));

describe('runMigration', () => {
  const config: MigrateConfig = {
    packagePatterns: ['**/package.json']
  } as MigrateConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    replaceInFileMock.mockReset();
    execCalls.length = 0;
    formatFails = false;
    syncFails = false;
    readDeferredPromptsMock.mockReturnValue([]);
  });

  it('runs migration and updates package.json specs', async () => {
    // Make replaceInFile call the "to" transform with a fake package.json
    replaceInFileMock.mockImplementation(
      async (opts: ReplaceInFileConfig & { to: ReplaceInFileConfig['to'] }) => {
        // Ensure we were asked to process our patterns and whole file content
        expect(opts.files).toEqual(config.packagePatterns);
        expect(opts.from?.toString()).toContain('[\\s\\S]*');

        const packageJsonString = `
{
  "dependencies": {
    "@nx/devkit": "^21.0.0"
  }
}
`;
        // Invoke the "to" transform (type-safe)
        const result =
          typeof opts.to === 'function'
            ? opts.to(packageJsonString, 'package.json') // packagePattern only matches package.json files
            : 'expected "to" to be a function';

        // Ensure the transform updated the content as expected
        expect(result).toContain('"@nx/devkit": "^22.0.0"');

        return [
          { file: 'package.json', hasChanged: result !== packageJsonString }
        ];
      }
    );

    await runMigration(config, '22.0.0');

    // Command orchestration
    expect(execCalls.map((c) => [c.cmd, c.args])).toEqual([
      // nx migrate <latest>
      [packageManager, ['nx', 'migrate', '22.0.0']],
      // install
      [`${packageManager} install`, undefined],
      // run migrations, Nx skips them when nothing was generated
      [
        packageManager,
        ['nx', 'migrate', '--run-migrations', '--if-exists', '--skip-install']
      ],
      // sync generated files against the installed versions
      [packageManager, ['nx', 'sync']],
      // format migrated files
      [packageManager, ['nx', 'format:write']]
    ]);

    // Check replaceInFile
    expect(replaceInFileMock).toHaveBeenCalledTimes(1);
    expect(updateDependenciesMock).toHaveBeenCalledWith(
      expect.stringContaining('"@nx/devkit"'),
      '22.0.0'
    );

    // Check some important logs
    expect(infoMock).toHaveBeenCalledWith('Running migrations');
    expect(debugMock).toHaveBeenCalledWith(
      'package.json versions were updated'
    );
    expect(infoMock).toHaveBeenCalledWith('Migration completed');
  });

  it('returns deferred prompt migrations and warns about them', async () => {
    const deferred = [{ name: '22-0-0-do-thing', prompt: 'tools/ai/do.md' }];
    readDeferredPromptsMock.mockReturnValue(deferred);

    replaceInFileMock.mockResolvedValue([
      { file: 'package.json', hasChanged: false }
    ]);

    await expect(runMigration(config, '22.0.0')).resolves.toEqual(deferred);

    expect(warningMock).toHaveBeenCalledWith(
      '1 prompt migration(s) require an AI agent and will be deferred'
    );
  });

  it('warns with the reason and completes when formatting fails', async () => {
    formatFails = true;

    replaceInFileMock.mockResolvedValue([
      { file: 'package.json', hasChanged: false }
    ]);

    await expect(runMigration(config, '22.0.0')).resolves.toEqual([]);

    expect(warningMock).toHaveBeenCalledWith(
      'Formatting failed, continue migration anyway: prettier exploded'
    );
    expect(infoMock).toHaveBeenCalledWith('Migration completed');
  });

  it('warns with the reason and completes when sync fails', async () => {
    syncFails = true;

    replaceInFileMock.mockResolvedValue([
      { file: 'package.json', hasChanged: false }
    ]);

    await expect(runMigration(config, '22.0.0')).resolves.toEqual([]);

    expect(warningMock).toHaveBeenCalledWith(
      'Sync failed, continue migration anyway: sync generator exploded'
    );
    // Formatting still runs after a failed sync
    expect(execCalls.map((c) => c.args)).toContainEqual(['nx', 'format:write']);
    expect(infoMock).toHaveBeenCalledWith('Migration completed');
  });

  it('returns no deferred prompts when there are no prompt migrations', async () => {
    replaceInFileMock.mockResolvedValue([
      { file: 'package.json', hasChanged: false }
    ]);

    await expect(runMigration(config, '22.0.0')).resolves.toEqual([]);

    expect(warningMock).not.toHaveBeenCalled();
    expect(infoMock).toHaveBeenCalledWith('Migration completed');
  });
});
