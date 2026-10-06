import { existsSync, readFileSync } from 'node:fs';

import { readDeferredPrompts } from './read-deferred-prompts';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn()
}));

const warningMock = vi.fn();
vi.mock('@actions/core', () => ({
  warning: (args: unknown) => warningMock(args)
}));

const existsSyncMock = vi.mocked(existsSync);
const readFileSyncMock = vi.mocked(readFileSync);

const migrationsFile = (migrations: unknown) =>
  readFileSyncMock.mockReturnValue(JSON.stringify({ migrations }));

describe('readDeferredPrompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockReturnValue(true);
  });

  it('returns prompt migrations only', () => {
    migrationsFile([
      { name: 'generator-only', version: '1.0.0' },
      { name: 'prompt-only', prompt: 'tools/ai-migrations/nx/1.0.0/a.md' },
      {
        name: 'hybrid',
        implementation: './src/x',
        prompt: 'tools/ai-migrations/nx/1.0.0/b.md'
      }
    ]);

    expect(readDeferredPrompts()).toEqual([
      { name: 'prompt-only', prompt: 'tools/ai-migrations/nx/1.0.0/a.md' },
      { name: 'hybrid', prompt: 'tools/ai-migrations/nx/1.0.0/b.md' }
    ]);
  });

  it('skips invalid entries and keeps the valid ones', () => {
    migrationsFile([
      null,
      'not an object',
      { prompt: 'tools/ai-migrations/nx/1.0.0/no-name.md' },
      { name: 42, prompt: 'tools/ai-migrations/nx/1.0.0/bad-name.md' },
      { name: 'empty-prompt', prompt: '' },
      { name: 'valid', prompt: 'tools/ai-migrations/nx/1.0.0/a.md' }
    ]);

    expect(readDeferredPrompts()).toEqual([
      { name: 'valid', prompt: 'tools/ai-migrations/nx/1.0.0/a.md' }
    ]);
    expect(warningMock).not.toHaveBeenCalled();
  });

  it('returns empty list when the migrations file is missing', () => {
    existsSyncMock.mockReturnValue(false);

    expect(readDeferredPrompts()).toEqual([]);
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it('returns empty list when there are no migrations', () => {
    migrationsFile(undefined);

    expect(readDeferredPrompts()).toEqual([]);
  });

  it('warns and returns empty list when the migrations file is malformed', () => {
    readFileSyncMock.mockReturnValue('not json');

    expect(readDeferredPrompts()).toEqual([]);
    expect(warningMock).toHaveBeenCalledWith(
      "Could not read prompt migrations from 'migrations.json'"
    );
  });
});
