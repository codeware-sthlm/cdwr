import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

vi.mock('./session.logic', () => ({ probeSession: vi.fn() }));

const run = async () => {
  const command = (await import('./session')).default;
  return runCommand({
    name: 'infisical session',
    command,
    argv: [],
    root: '/repo',
    env: {},
    prefs: memoryPrefs(),
    interactive: false,
    ui: fakeUi([], false),
    history: () => undefined,
    stdout: () => undefined
  });
};

describe('infisical session', () => {
  it('succeeds with a session', async () => {
    const { probeSession } = await import('./session.logic');
    vi.mocked(probeSession).mockReturnValue({ state: 'ok' });
    expect(await run()).toBe(EXIT.ok);
  });

  it('fails when logged out', async () => {
    const { probeSession } = await import('./session.logic');
    vi.mocked(probeSession).mockReturnValue({
      state: 'not-logged-in',
      hint: 'Run `infisical login`'
    });
    expect(await run()).toBe(EXIT.failed);
  });
});
