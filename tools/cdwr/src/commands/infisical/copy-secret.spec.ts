import { EXIT } from '../../cli/errors';
import * as infisical from '../../services/infisical';

import command from './copy-secret';
import { runSecretCommand } from './secret-commands.testing';
import { digest } from './secret-values.logic';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));
vi.mock('../../services/infisical', () => ({
  readOwnSecrets: vi.fn(),
  setInfisicalSecret: vi.fn()
}));

const SOURCE = 'postgres://u:hunter2pass@db.x.supabase.co:5432/app';
const OTHER = 'postgres://u:otherpass99@db.y.supabase.co:5432/app';

const args = (...rest: string[]) => [
  '--env',
  'production',
  '--folder',
  '/apps/cms',
  '--from',
  'DATABASE_URL',
  '--to',
  'DIRECT_DATABASE_URL',
  ...rest
];
const run = (...rest: string[]) =>
  runSecretCommand('infisical copy-secret', command, args(...rest));

const leaks = (out: string) =>
  [SOURCE, OTHER, 'hunter2pass', 'otherpass99'].filter((v) => out.includes(v));

describe('infisical copy-secret', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({
      DATABASE_URL: SOURCE
    });
  });

  it('plans a copy with the dry-run contract and no value', async () => {
    const { code, out, lines } = await run('--dry-run', '--json');
    expect(code).toBe(EXIT.ok);
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
    const json = JSON.parse(lines[0] ?? '{}');
    expect(json.plan.json).toEqual({
      environment: 'production',
      folder: '/apps/cms',
      from: 'DATABASE_URL',
      to: 'DIRECT_DATABASE_URL',
      state: 'absent',
      read: digest(SOURCE)
    });
    expect(leaks(out)).toEqual([]);
  });

  it('copies once and reports the outcome', async () => {
    const { code, out, lines } = await run('--yes', '--json');
    expect(code).toBe(EXIT.ok);
    expect(infisical.setInfisicalSecret).toHaveBeenCalledTimes(1);
    expect(infisical.setInfisicalSecret).toHaveBeenCalledWith({
      environment: 'production',
      path: '/apps/cms',
      key: 'DIRECT_DATABASE_URL',
      value: SOURCE
    });
    expect(JSON.parse(lines[0] ?? '{}').result.outcome).toBe(
      'DIRECT_DATABASE_URL at /apps/cms (production) copied from DATABASE_URL'
    );
    expect(leaks(out)).toEqual([]);
  });

  it('does nothing when the target already holds the value', async () => {
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({
      DATABASE_URL: SOURCE,
      DIRECT_DATABASE_URL: SOURCE
    });
    const { code, out } = await run('--yes');
    expect(code).toBe(EXIT.ok);
    expect(out).toContain('already copied');
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
    expect(leaks(out)).toEqual([]);
  });

  it('refuses to overwrite another value', async () => {
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({
      DATABASE_URL: SOURCE,
      DIRECT_DATABASE_URL: OTHER
    });
    const { code, out } = await run('--yes');
    expect(code).toBe(EXIT.usage);
    expect(out).toContain(
      'DIRECT_DATABASE_URL at /apps/cms already holds another value; secret-copy never overwrites'
    );
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
    expect(leaks(out)).toEqual([]);
  });

  it('refuses a missing source', async () => {
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({});
    const { code } = await run('--yes');
    expect(code).toBe(EXIT.usage);
  });

  it('tells a missing source from an empty one', async () => {
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({});
    const missing = await run('--yes');
    expect(missing.code).toBe(EXIT.usage);
    expect(missing.out).toContain('DATABASE_URL not found at /apps/cms');
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({ DATABASE_URL: '' });
    const empty = await run('--yes');
    expect(empty.code).toBe(EXIT.usage);
    expect(empty.out).toContain(
      'DATABASE_URL at /apps/cms is empty; nothing to copy'
    );
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
  });

  it('says so when the target exists but is empty', async () => {
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({
      DATABASE_URL: SOURCE,
      DIRECT_DATABASE_URL: ''
    });
    const { code, out } = await run('--yes');
    expect(code).toBe(EXIT.usage);
    expect(out).toContain(
      'DIRECT_DATABASE_URL at /apps/cms already exists (empty); secret-copy never overwrites'
    );
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
  });

  it('refuses without writing when the source changed since the plan', async () => {
    vi.mocked(infisical.readOwnSecrets)
      .mockResolvedValueOnce({ DATABASE_URL: SOURCE })
      .mockResolvedValueOnce({ DATABASE_URL: OTHER });
    const { code, out } = await run('--yes');
    expect(code).toBe(EXIT.failed);
    expect(out).toContain(
      'DATABASE_URL at /apps/cms changed since the plan; nothing written'
    );
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
    expect(leaks(out)).toEqual([]);
  });

  it('refuses what the vocabulary refuses', async () => {
    const { code } = await runSecretCommand('x', command, [
      '--env',
      'production',
      '--folder',
      '/agent-queue',
      '--from',
      'A',
      '--to',
      'B',
      '--yes'
    ]);
    expect(code).toBe(EXIT.usage);
    expect(infisical.readOwnSecrets).not.toHaveBeenCalled();
  });

  it('refuses without writing when the target appeared since the plan', async () => {
    vi.mocked(infisical.readOwnSecrets)
      .mockResolvedValueOnce({ DATABASE_URL: SOURCE })
      .mockResolvedValueOnce({
        DATABASE_URL: SOURCE,
        DIRECT_DATABASE_URL: OTHER
      });
    const { code, out } = await run('--yes');
    expect(code).toBe(EXIT.usage);
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
    expect(leaks(out)).toEqual([]);
  });

  it('scrubs an SDK error that holds a value', async () => {
    vi.mocked(infisical.setInfisicalSecret).mockRejectedValue(
      new Error(`rejected ${SOURCE}`)
    );
    const { code, out } = await run('--yes');
    expect(code).toBe(EXIT.failed);
    expect(out).toContain('rejected ***');
    expect(leaks(out)).toEqual([]);
  });
});
