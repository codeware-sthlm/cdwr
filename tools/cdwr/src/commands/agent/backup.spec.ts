import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

const backups = vi.hoisted(() => ({ dumpCms: vi.fn() }));

vi.mock('../../services/backups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/backups')>()),
  ...backups
}));

const DB_URL = 'postgres://user:pw@db.internal:5432/cms';

describe('agent backup', () => {
  let home: string;
  let ui: ReturnType<typeof fakeUi>;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'cdwr-agent-backup-'));
    backups.dumpCms.mockReset();
    ui = fakeUi([]);
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  async function backup(vars: Record<string, string>) {
    const command = (await import('./backup')).default;
    const exit = await runCommand({
      name: 'agent backup',
      command,
      argv: ['--yes'],
      root: '/ws/codeware',
      env: vars,
      prefs: memoryPrefs(),
      interactive: false,
      ui,
      history: () => undefined,
      stdout: () => undefined
    });
    return { exit };
  }

  const status = () =>
    JSON.parse(readFileSync(join(home, 'backup-status.json'), 'utf8')) as {
      at: string;
      ok: boolean;
      name: string | null;
      bytes: number | null;
      error: string | null;
    };

  const folder = (name: string) => join(home, 'backups', name);

  it('does nothing, naming what is missing', async () => {
    const { exit } = await backup({ AGENT_QUEUE_HOME: home });
    expect(exit).toBe(EXIT.ok);
    expect(backups.dumpCms).not.toHaveBeenCalled();
    expect(JSON.stringify(ui.printed)).toContain(
      'PLATFORM_BACKUP_DATABASE_URL'
    );
    expect(existsSync(join(home, 'backup-status.json'))).toBe(false);

    const none = await backup({ PLATFORM_BACKUP_DATABASE_URL: DB_URL });
    expect(none.exit).toBe(EXIT.ok);
    expect(backups.dumpCms).not.toHaveBeenCalled();
  });

  it('dumps the payload schema, records the status and prunes to 7', async () => {
    for (let day = 1; day <= 8; day++) {
      mkdirSync(folder(`cms-production-2026-01-0${day}T00-00-00`), {
        recursive: true
      });
    }
    mkdirSync(folder('notes'), { recursive: true });
    // A run the deadline killed
    mkdirSync(folder('.cms-production-2026-01-08T02-00-00.partial'), {
      recursive: true
    });
    backups.dumpCms.mockImplementation(async ({ dir }: { dir: string }) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'schema.sql'), 'abc');
      writeFileSync(join(dir, 'data.sql'), 'de');
    });
    const { exit } = await backup({
      PLATFORM_BACKUP_DATABASE_URL: DB_URL,
      AGENT_QUEUE_HOME: home
    });
    expect(exit).toBe(EXIT.ok);
    expect(backups.dumpCms).toHaveBeenCalledWith({
      url: DB_URL,
      dir: expect.stringMatching(/\/backups\/\.cms-production-.*\.partial$/),
      schema: 'payload'
    });
    const written = status();
    expect(written).toMatchObject({ ok: true, bytes: 5, error: null });
    expect(written.name).toMatch(/^cms-production-/);
    expect(existsSync(folder(written.name as string))).toBe(true);
    expect(existsSync(folder(`.${written.name}.partial`))).toBe(false);
    expect(
      existsSync(folder('.cms-production-2026-01-08T02-00-00.partial'))
    ).toBe(false);
    expect(statSync(join(home, 'backup-status.json')).mode & 0o777).toBe(0o600);
    // 9 dumps, 7 kept: the two oldest are gone, the stray folder stays
    expect(existsSync(folder('cms-production-2026-01-01T00-00-00'))).toBe(
      false
    );
    expect(existsSync(folder('cms-production-2026-01-02T00-00-00'))).toBe(
      false
    );
    expect(existsSync(folder('cms-production-2026-01-03T00-00-00'))).toBe(true);
    expect(existsSync(folder('notes'))).toBe(true);
  });

  it('records a failure without the url, removes its folder, prunes nothing and fails', async () => {
    for (let day = 1; day <= 8; day++) {
      mkdirSync(folder(`cms-production-2026-01-0${day}T00-00-00`), {
        recursive: true
      });
    }
    backups.dumpCms.mockImplementation(async ({ dir }: { dir: string }) => {
      mkdirSync(dir, { recursive: true });
      throw new Error(`pg_dump could not connect to ${DB_URL}\nsecond line`);
    });
    const { exit } = await backup({
      PLATFORM_BACKUP_DATABASE_URL: DB_URL,
      AGENT_QUEUE_HOME: home
    });
    expect(exit).toBe(EXIT.failed);
    const written = status();
    expect(written).toMatchObject({ ok: false, name: null, bytes: null });
    expect(written.error).toBe(
      'pg_dump could not connect to [url] second line'
    );
    expect(
      readFileSync(join(home, 'backup-status.json'), 'utf8')
    ).not.toContain('pw@');
    expect(JSON.stringify(ui.printed)).not.toContain('pw@');
    // Only the partial folder of the run is gone
    for (let day = 1; day <= 8; day++) {
      expect(
        existsSync(folder(`cms-production-2026-01-0${day}T00-00-00`))
      ).toBe(true);
    }
    expect(
      readFileSync(join(home, 'backup-status.json'), 'utf8').length
    ).toBeGreaterThan(0);
  });
});
