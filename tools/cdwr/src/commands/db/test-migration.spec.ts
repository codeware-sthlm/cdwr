import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { backupName } from '../../services/backups';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

const run = vi.fn(async (binary: string, args: string[] = []) => {
  if (binary === 'docker') {
    if (args[0] === 'ps') return { stdout: '', stderr: '' };
    return { stdout: 'container-id\n', stderr: '' };
  }
  const last = args[args.length - 1] ?? '';
  if (args.some((a) => a.startsWith('--file=')))
    return { stdout: '', stderr: '' };
  if (last === 'SELECT 1') return { stdout: '1', stderr: '' };
  if (last.includes('schemata')) return { stdout: 'payload', stderr: '' };
  if (last.includes('payload_migrations') && last.includes('COUNT'))
    return { stdout: '3', stderr: '' };
  if (last.includes('ORDER BY id DESC LIMIT 1'))
    return { stdout: '20260912_131500_cod_477_retire_media_block', stderr: '' };
  return { stdout: '', stderr: '' };
});

vi.mock('../../services/shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/shell')>();
  return { ...actual, run: (...a: [string, string[]?]) => run(...a) };
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must accept the forwarded args
const runCmsScript = vi.fn(async (..._args: unknown[]) => ({
  stdout: '[migrate] applied: 20260912_131500_cod_477_retire_media_block\n',
  stderr: ''
}));
vi.mock('../../services/database', () => ({
  runCmsScript: (...a: unknown[]) => runCmsScript(...a)
}));

describe('db test-migration', () => {
  let root: string;
  let backup: string;

  beforeEach(() => {
    run.mockClear();
    runCmsScript.mockClear();
    root = mkdtempSync(join(tmpdir(), 'cdwr-test-migration-'));
    backup = backupName('cms', 'production', new Date('2026-09-19T21:05:33Z'));
    const dir = join(root, 'backups', backup);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'schema.sql'),
      '-- Name: payload; Type: SCHEMA; Schema: -; Owner: -\nCREATE SCHEMA payload;\n'
    );
    writeFileSync(
      join(dir, 'data.sql'),
      '-- Data for Name: payload_migrations; Type: TABLE DATA; Schema: payload; Owner: -\n'
    );
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('restores an existing backup, migrates and tears the container down', async () => {
    const command = (await import('./test-migration')).default;
    const stdout: string[] = [];
    const exit = await runCommand({
      name: 'db test-migration',
      command,
      argv: ['--backup', backup],
      root,
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui: fakeUi([]),
      history: () => undefined,
      stdout: (t) => stdout.push(t)
    });

    expect(exit).toBe(EXIT.ok);
    expect(runCmsScript).toHaveBeenCalledWith(
      root,
      'run-migrations.ts',
      'development',
      expect.objectContaining({ DATABASE_SCHEMA: 'payload' }),
      {}
    );
    // Stops any stale container, starts one, and stops it again afterwards
    expect(
      run.mock.calls.filter(
        ([binary, args = []]) => binary === 'docker' && args[0] === 'stop'
      )
    ).toHaveLength(1);
    expect(
      run.mock.calls.some(
        ([binary, args = []]) => binary === 'docker' && args[0] === 'run'
      )
    ).toBe(true);
  });

  it('keeps the container running when asked', async () => {
    const command = (await import('./test-migration')).default;
    const exit = await runCommand({
      name: 'db test-migration',
      command,
      argv: ['--backup', backup, '--keep'],
      root,
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui: fakeUi([]),
      history: () => undefined,
      stdout: () => undefined
    });

    expect(exit).toBe(EXIT.ok);
    expect(
      run.mock.calls.filter(
        ([binary, args = []]) => binary === 'docker' && args[0] === 'stop'
      )
    ).toHaveLength(0);
  });

  it('refuses without a backup unless --fresh is given', async () => {
    const command = (await import('./test-migration')).default;
    const exit = await runCommand({
      name: 'db test-migration',
      command,
      argv: [],
      root,
      env: {},
      prefs: memoryPrefs(),
      interactive: false,
      ui: fakeUi([], false),
      history: () => undefined,
      stdout: () => undefined
    });

    expect(exit).toBe(EXIT.failed);
  });
});
