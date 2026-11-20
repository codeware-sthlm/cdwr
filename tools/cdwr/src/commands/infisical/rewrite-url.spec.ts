import { EXIT } from '../../cli/errors';
import * as infisical from '../../services/infisical';

import command from './rewrite-url';
import { runSecretCommand } from './secret-commands.testing';
import { digest } from './secret-values.logic';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));
vi.mock('../../services/infisical', () => ({
  readOwnSecrets: vi.fn(),
  setInfisicalSecret: vi.fn()
}));

const PASSWORD = 'p%40ss-w0rd-Z9';
const CURRENT = `postgresql://postgres:${PASSWORD}@db.x.supabase.co:5432/postgres?sslmode=require`;
const NEXT = `postgresql://postgres.abc:${PASSWORD}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require`;

const base = [
  '--env',
  'production',
  '--folder',
  '/apps/cms',
  '--key',
  'DATABASE_URL'
];
const parts = [
  '--host',
  'aws-0-eu-central-1.pooler.supabase.com',
  '--port',
  '6543',
  '--user',
  'postgres.abc'
];
const run = (...rest: string[]) =>
  runSecretCommand('infisical rewrite-url', command, [...base, ...rest]);

const leaks = (out: string) =>
  [CURRENT, NEXT, PASSWORD, 'p@ss-w0rd-Z9'].filter((v) => out.includes(v));

describe('infisical rewrite-url', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({
      DATABASE_URL: CURRENT
    });
  });

  it('plans with the dry-run contract and no value', async () => {
    const { code, out, lines } = await run(...parts, '--dry-run', '--json');
    expect(code).toBe(EXIT.ok);
    expect(JSON.parse(lines[0] ?? '{}').plan.json).toEqual({
      environment: 'production',
      folder: '/apps/cms',
      key: 'DATABASE_URL',
      state: 'different',
      shape: {
        host: {
          from: 'db.x.supabase.co',
          to: 'aws-0-eu-central-1.pooler.supabase.com'
        },
        port: { from: '5432', to: '6543' },
        userChanged: true,
        passwordKept: true
      },
      read: digest(CURRENT)
    });
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
    expect(leaks(out)).toEqual([]);
  });

  it('rewrites only host, port and user', async () => {
    const { code, out, lines } = await run(...parts, '--yes', '--json');
    expect(code).toBe(EXIT.ok);
    expect(infisical.setInfisicalSecret).toHaveBeenCalledWith({
      environment: 'production',
      path: '/apps/cms',
      key: 'DATABASE_URL',
      value: NEXT
    });
    expect(JSON.parse(lines[0] ?? '{}').result.outcome).toBe(
      'DATABASE_URL at /apps/cms (production): host db.x.supabase.co → aws-0-eu-central-1.pooler.supabase.com, port 5432 → 6543, user postgres → postgres.abc'
    );
    expect(leaks(out)).toEqual([]);
  });

  it('names only the changed parts', async () => {
    const { lines } = await run('--port', '6543', '--yes', '--json');
    expect(JSON.parse(lines[0] ?? '{}').result.outcome).toBe(
      'DATABASE_URL at /apps/cms (production): port 5432 → 6543'
    );
  });

  it('does nothing when already in the shape', async () => {
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({
      DATABASE_URL: NEXT
    });
    const { code, out } = await run(...parts, '--yes');
    expect(code).toBe(EXIT.ok);
    expect(out).toContain('already rewritten');
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
    expect(leaks(out)).toEqual([]);
  });

  it('refuses a missing key and a url without a password', async () => {
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({});
    expect((await run(...parts, '--yes')).code).toBe(EXIT.usage);
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({
      DATABASE_URL: 'postgresql://postgres@db.x.supabase.co/postgres'
    });
    const { code, out } = await run(...parts, '--yes');
    expect(code).toBe(EXIT.usage);
    expect(out).toContain(
      'DATABASE_URL at /apps/cms is not a url with a password'
    );
  });

  it('refuses a value that is not a url, without echoing it', async () => {
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({
      DATABASE_URL: 'not-a-url-but-secret'
    });
    const { code, out } = await run(...parts, '--yes');
    expect(code).toBe(EXIT.usage);
    expect(out).not.toContain('not-a-url-but-secret');
  });

  it('refuses without any part, or a bad one', async () => {
    expect((await run('--yes')).code).toBe(EXIT.usage);
    expect((await run('--port', '70000', '--yes')).code).toBe(EXIT.usage);
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
  });

  it('refuses without writing when the url changed since the plan', async () => {
    vi.mocked(infisical.readOwnSecrets)
      .mockResolvedValueOnce({ DATABASE_URL: CURRENT })
      .mockResolvedValueOnce({
        DATABASE_URL: CURRENT.replace('db.x.', 'db.z.')
      });
    const { code, out } = await run(...parts, '--yes');
    expect(code).toBe(EXIT.failed);
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
    expect(leaks(out)).toEqual([]);
  });

  it('scrubs an SDK error that holds the value', async () => {
    vi.mocked(infisical.setInfisicalSecret).mockRejectedValue(
      new Error(`rejected ${NEXT} for ${PASSWORD}`)
    );
    const { code, out } = await run(...parts, '--yes');
    expect(code).toBe(EXIT.failed);
    expect(leaks(out)).toEqual([]);
  });

  it('refuses a stored value that is not in canonical url form', async () => {
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({
      DATABASE_URL: 'postgresql://u:pa"ss@db.x.supabase.co:5432'
    });
    const { code, out } = await run(...parts, '--yes');
    expect(code).toBe(EXIT.usage);
    expect(out).toContain(
      'DATABASE_URL at /apps/cms is not in canonical url form; refused'
    );
    expect(out).not.toContain('pa"ss');
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
  });

  it('refuses a part the url class does not accept', async () => {
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({
      DATABASE_URL: 'https://u:pw@db.x.com/p'
    });
    const { code, out } = await run('--host', '256.1.1.1', '--yes');
    expect(code).toBe(EXIT.usage);
    expect(out).toContain(
      'host 256.1.1.1 was not accepted for DATABASE_URL at /apps/cms'
    );
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
  });

  it('refuses a default port, which the url drops', async () => {
    vi.mocked(infisical.readOwnSecrets).mockResolvedValue({
      DATABASE_URL: 'https://u:pw@db.x.com:8443/p'
    });
    const { code, out } = await run('--port', '443', '--yes');
    expect(code).toBe(EXIT.usage);
    expect(out).toContain(
      'port 443 was not accepted for DATABASE_URL at /apps/cms'
    );
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
  });

  it('refuses without writing when the url changed to another since the plan', async () => {
    vi.mocked(infisical.readOwnSecrets)
      .mockResolvedValueOnce({ DATABASE_URL: CURRENT })
      .mockResolvedValueOnce({
        DATABASE_URL: CURRENT.replace('sslmode=require', 'sslmode=disable')
      });
    const { code, out } = await run(...parts, '--yes');
    expect(code).toBe(EXIT.failed);
    expect(out).toContain(
      'DATABASE_URL at /apps/cms changed since the plan; nothing written'
    );
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
    expect(leaks(out)).toEqual([]);
  });
});
