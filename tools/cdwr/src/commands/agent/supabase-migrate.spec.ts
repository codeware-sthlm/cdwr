import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { CommandError } from '../../services/shell';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

type Call = [
  string,
  string[],
  { input?: string; env?: NodeJS.ProcessEnv } | undefined
];

const run =
  vi.fn<(...args: Call) => Promise<{ stdout: string; stderr: string }>>();
vi.mock('../../services/shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/shell')>();
  return { ...actual, run: (...a: Call) => run(...a) };
});

const DIR = 'tools/cdwr/agent-queue/supabase/migrations';
const FILE = `${DIR}/20261120120000_x.sql`;
const NAME = '20261120120000_x.sql';
const SQL = 'create table public.x (id int);\n';
const URL = 'postgres://user:s3cret@db.example.co:6543/postgres';

const ok = (stdout = '') => ({ stdout, stderr: '' });
const fail = (stderr: string) => new CommandError('psql', '', stderr, 3);

describe('agent supabase-migrate', () => {
  let root: string;
  let ui: ReturnType<typeof fakeUi>;
  let printed: string;

  beforeEach(() => {
    run.mockReset();
    ui = fakeUi([]);
    printed = '';
    root = mkdtempSync(join(tmpdir(), 'cdwr-migrate-'));
    mkdirSync(join(root, DIR), { recursive: true });
    writeFileSync(join(root, FILE), SQL);
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  async function migrate(
    argv: string[],
    env: Record<string, string> = { AGENT_SUPABASE_DB_URL: URL }
  ) {
    const command = (await import('./supabase-migrate')).default;
    const exit = await runCommand({
      name: 'agent supabase-migrate',
      command,
      argv,
      root,
      env,
      prefs: memoryPrefs(),
      interactive: false,
      ui,
      history: () => undefined,
      stdout: (text: string) => {
        printed += text;
      }
    });
    return exit;
  }

  it('dry run: tries the file in a rolled-back transaction', async () => {
    run.mockResolvedValueOnce(ok('')).mockResolvedValueOnce(ok(''));
    const exit = await migrate([FILE, '--dry-run', '--json']);
    expect(exit).toBe(EXIT.ok);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0]?.[2]?.input).toContain('applied_migrations');
    expect(run.mock.calls[1]?.[2]?.input).toBe(`BEGIN;\n${SQL}\nROLLBACK;\n`);
    for (const call of run.mock.calls) {
      expect(call[0]).toBe('psql');
      expect(call[1]).toContain(`file=${NAME}`);
      expect(call[1].join(' ')).not.toContain('s3cret');
      expect(call[2]?.env?.['PGPASSWORD']).toBe('s3cret');
      expect(call[2]?.env?.['PGHOST']).toBe('db.example.co');
      expect(call[2]?.env?.['PGSSLMODE']).toBe('require');
    }
    expect(JSON.parse(printed).plan.json).toEqual({
      file: FILE,
      applied: false,
      dryRun: 'ok'
    });
  });

  it('an applied migration is not tried again', async () => {
    run.mockResolvedValueOnce(ok('1\n'));
    const exit = await migrate([FILE, '--dry-run', '--json']);
    expect(exit).toBe(EXIT.ok);
    expect(run).toHaveBeenCalledTimes(1);
    expect(JSON.parse(printed).plan.json).toEqual({
      file: FILE,
      applied: true,
      dryRun: null
    });
  });

  it('a ledger that does not exist yet counts as not applied', async () => {
    run
      .mockRejectedValueOnce(
        fail(
          'psql:<stdin>:1: ERROR:  relation "public.applied_migrations" does not exist'
        )
      )
      .mockResolvedValueOnce(ok(''));
    expect(await migrate([FILE, '--dry-run', '--json'])).toBe(EXIT.ok);
    expect(JSON.parse(printed).plan.json.applied).toBe(false);
  });

  it('a failing dry run fails with the first error line', async () => {
    run
      .mockResolvedValueOnce(ok(''))
      .mockRejectedValueOnce(
        fail('psql:<stdin>:2: ERROR:  syntax error\nLINE 1: x')
      );
    expect(await migrate([FILE, '--dry-run'])).toBe(EXIT.failed);
    expect(JSON.stringify(ui.printed)).toContain('syntax error');
  });

  it('applies the file and its ledger row in one call', async () => {
    run
      .mockResolvedValueOnce(ok('')) // plan: ledger
      .mockResolvedValueOnce(ok('')) // plan: dry run
      .mockResolvedValueOnce(ok('')) // apply: ledger again
      .mockResolvedValueOnce(ok('')); // apply
    expect(await migrate([FILE, '--yes', '--json'])).toBe(EXIT.ok);
    expect(run).toHaveBeenCalledTimes(4);
    const last = run.mock.calls[3]?.[2]?.input ?? '';
    expect(last).toBe(
      `BEGIN;\n${SQL}\ninsert into public.applied_migrations (file) values (:'file');\nCOMMIT;\n`
    );
    const json = JSON.parse(printed).result;
    expect(json.file).toBe(FILE);
    expect(new Date(json.appliedAt).toISOString()).toBe(json.appliedAt);
  });

  it('refuses to apply what the ledger lists by now', async () => {
    run
      .mockResolvedValueOnce(ok(''))
      .mockResolvedValueOnce(ok(''))
      .mockResolvedValueOnce(ok('1\n'));
    expect(await migrate([FILE, '--yes'])).toBe(EXIT.failed);
    expect(run).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(ui.printed)).toContain('already applied');
  });

  it('refuses a file with its own transaction before any call', async () => {
    writeFileSync(join(root, FILE), `begin;\n${SQL}commit;\n`);
    expect(await migrate([FILE, '--dry-run'])).toBe(EXIT.failed);
    expect(run).not.toHaveBeenCalled();
    expect(JSON.stringify(ui.printed)).toContain('transaction');
  });

  it('refuses a path outside the migrations folder', async () => {
    expect(await migrate(['apps/cms/package.json', '--dry-run'])).not.toBe(
      EXIT.ok
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses a file that does not exist', async () => {
    const missing = `${DIR}/20261120130000_missing.sql`;
    expect(await migrate([missing, '--dry-run'])).toBe(EXIT.failed);
    expect(run).not.toHaveBeenCalled();
  });

  it('needs the database url', async () => {
    expect(await migrate([FILE, '--dry-run'], {})).toBe(EXIT.failed);
    expect(run).not.toHaveBeenCalled();
    expect(JSON.stringify(ui.printed)).toContain('AGENT_SUPABASE_DB_URL');
  });
});
