import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

vi.mock('../../services/fly', () => ({
  configAppName: vi.fn((_root: string, app: string) => `cdwr-${app}`),
  listAppNames: vi
    .fn()
    .mockResolvedValue([
      'cdwr-builder',
      'cdwr-cms',
      'cdwr-cms-acme',
      'cdwr-web-production'
    ]),
  restartMachines: vi.fn().mockResolvedValue(1),
  belongsTo: (name: string, environment: 'preview' | 'production') =>
    (environment === 'preview') === /-pr-(\d+)(?:-|$)/.test(name)
}));

vi.mock('../../services/infisical', () => ({
  readSecrets: vi.fn(),
  assertWritable: vi.fn().mockResolvedValue(undefined),
  setInfisicalSecret: vi
    .fn()
    .mockResolvedValue({ action: 'updated', key: 'x', path: '/x' }),
  deleteInfisicalSecret: vi.fn().mockResolvedValue(true)
}));

const BUILDER = '/apps/builder';
const CMS = '/apps/cms';

async function run(
  secrets: { builder: Record<string, string>; cms: Record<string, string> },
  argv: string[] = []
) {
  const fly = await import('../../services/fly');
  const infisical = await import('../../services/infisical');
  vi.mocked(fly.restartMachines).mockClear();
  vi.mocked(infisical.setInfisicalSecret).mockClear();
  vi.mocked(infisical.deleteInfisicalSecret).mockClear();
  vi.mocked(infisical.readSecrets).mockImplementation(async (_env, path) =>
    path === BUILDER ? secrets.builder : secrets.cms
  );
  const command = (await import('./rotate-token')).default;

  const ui = fakeUi(['builder']);
  const out: string[] = [];
  const exit = await runCommand({
    name: 'builder rotate-token',
    command,
    argv: ['--env', 'production', ...argv],
    root: '/repo',
    env: {},
    prefs: memoryPrefs(),
    interactive: true,
    ui,
    history: () => undefined,
    stdout: (text: string) => out.push(text)
  });
  const restarted = vi
    .mocked(fly.restartMachines)
    .mock.calls.map(([app]) => app);
  return { exit, ui, infisical, restarted, out };
}

describe('builder rotate-token', () => {
  it('rolls through every step in one run on a fresh token', async () => {
    const { exit, ui, infisical, restarted } = await run({
      builder: { BUILDER_TOKEN: 'old' },
      cms: { BUILDER_TOKEN: 'old' }
    });

    expect(exit).toBe(EXIT.ok);
    const sets = vi.mocked(infisical.setInfisicalSecret).mock.calls;
    expect(sets).toHaveLength(3);
    expect(sets[0]?.[0]).toMatchObject({
      path: BUILDER,
      key: 'BUILDER_TOKEN_PREVIOUS',
      value: 'old'
    });
    expect(sets[1]?.[0]).toMatchObject({ path: BUILDER, key: 'BUILDER_TOKEN' });
    const fresh = sets[1]?.[0].value;
    expect(fresh).toMatch(/^[0-9a-f]{64}$/);
    expect(sets[2]?.[0]).toMatchObject({
      path: CMS,
      key: 'BUILDER_TOKEN',
      value: fresh
    });
    expect(infisical.deleteInfisicalSecret).toHaveBeenCalledWith(
      expect.objectContaining({ path: BUILDER, key: 'BUILDER_TOKEN_PREVIOUS' })
    );
    expect(restarted).toEqual([
      'cdwr-builder',
      'cdwr-cms',
      'cdwr-cms-acme',
      'cdwr-builder'
    ]);
    expect(ui.asked[0]).toContain('Type');
  });

  it('resumes from staged without generating a token again', async () => {
    const { exit, infisical, restarted } = await run({
      builder: { BUILDER_TOKEN: 'new', BUILDER_TOKEN_PREVIOUS: 'old' },
      cms: { BUILDER_TOKEN: 'old' }
    });

    expect(exit).toBe(EXIT.ok);
    const sets = vi.mocked(infisical.setInfisicalSecret).mock.calls;
    expect(sets).toHaveLength(1);
    expect(sets[0]?.[0]).toMatchObject({
      path: CMS,
      key: 'BUILDER_TOKEN',
      value: 'new'
    });
    expect(infisical.deleteInfisicalSecret).toHaveBeenCalledTimes(1);
    expect(restarted).toEqual([
      'cdwr-builder',
      'cdwr-cms',
      'cdwr-cms-acme',
      'cdwr-builder'
    ]);
  });

  it('resumes from switched by restarting cms and retiring only', async () => {
    const { exit, infisical, restarted } = await run({
      builder: { BUILDER_TOKEN: 'new', BUILDER_TOKEN_PREVIOUS: 'old' },
      cms: { BUILDER_TOKEN: 'new' }
    });

    expect(exit).toBe(EXIT.ok);
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
    expect(infisical.deleteInfisicalSecret).toHaveBeenCalledTimes(1);
    expect(restarted).toEqual(['cdwr-cms', 'cdwr-cms-acme', 'cdwr-builder']);
  });

  it('writes and restarts nothing on a dry run, and never prints the token', async () => {
    const { exit, infisical, restarted, out } = await run(
      {
        builder: { BUILDER_TOKEN: 'old-secret-value' },
        cms: { BUILDER_TOKEN: 'old-secret-value' }
      },
      ['--dry-run']
    );

    expect(exit).toBe(EXIT.ok);
    expect(infisical.setInfisicalSecret).not.toHaveBeenCalled();
    expect(infisical.deleteInfisicalSecret).not.toHaveBeenCalled();
    expect(restarted).toEqual([]);
    expect(out.join('')).not.toContain('old-secret-value');
  });
});
