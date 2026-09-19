import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

const status = vi.fn();
const certsList = vi.fn();
const secretsList = vi.fn();
const listAppNames = vi.fn();

vi.mock('../../services/fly', () => ({
  fly: () => ({
    status,
    certs: { list: certsList },
    secrets: { list: secretsList }
  }),
  listAppNames: (...a: unknown[]) => listAppNames(...a)
}));

const machine = (state: string) => ({
  id: 'm1',
  name: 'app-01',
  state,
  region: 'arn',
  imageRef: { registry: 'r', repository: 'app', tag: 'v1', digest: 'x' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  config: { env: {}, metadata: {}, guest: { cpus: 1, memory_mb: 256 } },
  events: [],
  hostStatus: 'ok'
});

describe('fly info', () => {
  beforeEach(() => {
    status.mockReset();
    certsList.mockReset();
    secretsList.mockReset();
    listAppNames.mockReset();
  });

  it('reads one app and shows the detail block', async () => {
    status.mockResolvedValue({
      name: 'cdwr-cms',
      deployed: true,
      hostname: 'cdwr-cms.fly.dev',
      version: 2,
      organization: { slug: 'codeware' },
      machines: [machine('started')]
    });
    certsList.mockResolvedValue([]);
    secretsList.mockResolvedValue([{ name: 'DATABASE_URL', digest: 'x' }]);

    const command = (await import('./info')).default;
    const exit = await runCommand({
      name: 'fly info',
      command,
      argv: ['--apps', 'cdwr-cms'],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui: fakeUi([]),
      history: () => undefined,
      stdout: () => undefined
    });

    expect(exit).toBe(EXIT.ok);
    expect(status).toHaveBeenCalledWith({ app: 'cdwr-cms' });
    expect(listAppNames).not.toHaveBeenCalled();
  });

  it('lists every app matching the prefix when none are given', async () => {
    listAppNames.mockResolvedValue(['cdwr-cms', 'cdwr-web', 'other']);
    status.mockResolvedValue({
      name: 'cdwr-cms',
      deployed: true,
      hostname: 'h',
      version: 1,
      organization: { slug: 'codeware' },
      machines: [machine('started'), machine('stopped')]
    });
    certsList.mockResolvedValue([]);
    secretsList.mockResolvedValue([]);

    const command = (await import('./info')).default;
    const stdout: string[] = [];
    const exit = await runCommand({
      name: 'fly info',
      command,
      argv: ['--prefix', 'cdwr-', '--json'],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: false,
      ui: fakeUi([], false),
      history: () => undefined,
      stdout: (t) => stdout.push(t)
    });

    expect(exit).toBe(EXIT.ok);
    expect(listAppNames).toHaveBeenCalled();
    // Only apps matching the prefix are read, 'other' is filtered out.
    expect(status).toHaveBeenCalledTimes(2);
  });

  it('ends without applying when no app matches', async () => {
    listAppNames.mockResolvedValue(['other']);

    const command = (await import('./info')).default;
    const exit = await runCommand({
      name: 'fly info',
      command,
      argv: ['--prefix', 'cdwr-', '--json'],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: false,
      ui: fakeUi([], false),
      history: () => undefined,
      stdout: () => undefined
    });

    expect(exit).toBe(EXIT.ok);
    expect(status).not.toHaveBeenCalled();
  });
});
