import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

const tenant = {
  id: 19,
  name: 'cdwr.io',
  slug: 'cdwr-io',
  deployment: null,
  supportedLocales: ['en'],
  createdAt: '2026-09-24T18:00:00.000Z',
  apiKey: 'the-secret-key',
  domains: [],
  settings: null,
  counts: { pages: 6 }
};

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));
vi.mock('../../services/database', () => ({
  resolveDatabaseUrl: vi.fn(async () => 'postgres://fake'),
  withDatabase: vi.fn((url: string, fn: (url: string) => unknown) => fn(url)),
  // One workspace in the database, which is exactly the case that used to be
  // mistaken for a request for that workspace
  runCmsScript: vi.fn(async () => ({
    stdout: `TENANT_DETAILS=${JSON.stringify([tenant])}\n`,
    stderr: ''
  })),
  redactReported: (output: string) => output
}));
vi.mock('../../services/fly', () => ({
  listPreviewCmsApps: vi.fn(async () => [])
}));

const run = async (argv: Array<string>) => {
  const command = (await import('./info')).default;
  const ui = fakeUi([]);
  const stdout: Array<string> = [];
  const exit = await runCommand({
    name: 'tenant info',
    command,
    argv: ['--env', 'development', ...argv],
    root: '/repo',
    env: {},
    prefs: memoryPrefs(),
    interactive: false,
    ui,
    history: () => undefined,
    stdout: (text) => stdout.push(text)
  });
  return { exit, printed: JSON.stringify(ui.printed) + stdout.join('\n') };
};

describe('tenant info', () => {
  it('keeps the key out of an overview, even when only one workspace exists', async () => {
    const { exit, printed } = await run(['--json']);

    expect(exit).toBe(EXIT.ok);
    expect(printed).toContain('cdwr-io');
    expect(printed).not.toContain('the-secret-key');
  });

  it('shows the key when that workspace is asked for by slug', async () => {
    const { exit, printed } = await run(['--tenant', 'cdwr-io', '--json']);

    expect(exit).toBe(EXIT.ok);
    expect(printed).toContain('the-secret-key');
  });
});
