import { EXIT } from '../../cli/errors';
import * as infisical from '../../services/infisical';

import { runSecretCommand } from './secret-commands.testing';
import { digest } from './secret-values.logic';
import command from './set-config';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));
vi.mock('../../services/infisical', () => ({
  readOwnSecrets: vi.fn(),
  setInfisicalSecret: vi.fn()
}));

const OLD = 'old-secret-looking-value';

const run = (value: string, ...rest: string[]) =>
  runSecretCommand('infisical set-config', command, [
    '--env',
    'production',
    '--folder',
    '/apps/cms',
    '--key',
    'DATABASE_POOL_MAX',
    '--value',
    value,
    ...rest
  ]);

describe('infisical set-config', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({});
  });

  it('plans with the dry-run contract', async () => {
    const { code, lines } = await run('4', '--dry-run', '--json');
    expect(code).toBe(EXIT.ok);
    expect(JSON.parse(lines[0] ?? '{}').plan.json).toEqual({
      environment: 'production',
      folder: '/apps/cms',
      key: 'DATABASE_POOL_MAX',
      state: 'absent',
      value: '4',
      read: ''
    });
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
  });

  it('writes once and reports the outcome', async () => {
    const { code, lines } = await run('4', '--yes', '--json');
    expect(code).toBe(EXIT.ok);
    expect(infisical.setInfisicalSecret).toHaveBeenCalledWith({
      environment: 'production',
      path: '/apps/cms',
      key: 'DATABASE_POOL_MAX',
      value: '4'
    });
    expect(JSON.parse(lines[0] ?? '{}').result.outcome).toBe(
      'DATABASE_POOL_MAX at /apps/cms (production) = 4'
    );
  });

  it('does nothing when already set', async () => {
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({
      DATABASE_POOL_MAX: '4'
    });
    const { code, out } = await run('4', '--yes');
    expect(code).toBe(EXIT.ok);
    expect(out).toContain('already set');
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
  });

  it('never shows the value it replaces', async () => {
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({
      DATABASE_POOL_MAX: OLD
    });
    vi.mocked(infisical.setInfisicalSecret).mockRejectedValue(
      new Error(`failed, was ${OLD}`)
    );
    const dry = await run('4', '--dry-run', '--json');
    expect(dry.out).not.toContain(OLD);
    const { code, out } = await run('4', '--yes');
    expect(code).toBe(EXIT.failed);
    expect(out).toContain('failed, was ***');
    expect(out).not.toContain(OLD);
  });

  it('refuses a secret-looking key, a bad value and a bad folder', async () => {
    const key = await runSecretCommand('x', command, [
      '--env',
      'production',
      '--folder',
      '/apps/cms',
      '--key',
      'API_KEY',
      '--value',
      '4',
      '--yes'
    ]);
    expect(key.code).toBe(EXIT.usage);
    expect((await run('hello', '--yes')).code).toBe(EXIT.usage);
    const folder = await runSecretCommand('x', command, [
      '--env',
      'production',
      '--folder',
      '/',
      '--key',
      'A',
      '--value',
      '4',
      '--yes'
    ]);
    expect(folder.code).toBe(EXIT.usage);
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
  });

  it('refuses without writing when the state changed since the plan', async () => {
    vi.mocked(infisical.readOwnSecrets)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ DATABASE_POOL_MAX: '4' });
    const { code } = await run('4', '--yes');
    expect(code).toBe(EXIT.failed);
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
  });

  it('holds a digest of the current value, not the value', async () => {
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({
      DATABASE_POOL_MAX: OLD
    });
    const { lines, out } = await run('4', '--dry-run', '--json');
    expect(JSON.parse(lines[0] ?? '{}').plan.json.read).toBe(digest(OLD));
    expect(out).not.toContain(OLD);
  });

  it('refuses without writing when the value changed to another since the plan', async () => {
    vi.mocked(infisical.readOwnSecrets)
      .mockResolvedValueOnce({ DATABASE_POOL_MAX: '5' })
      .mockResolvedValueOnce({ DATABASE_POOL_MAX: '6' });
    const { code, out } = await run('4', '--yes');
    expect(code).toBe(EXIT.failed);
    expect(out).toContain(
      'DATABASE_POOL_MAX at /apps/cms changed since the plan; nothing written'
    );
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
  });
});
