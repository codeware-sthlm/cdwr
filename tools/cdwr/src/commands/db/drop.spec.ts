import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

const sshExec = vi.fn(async (...args: unknown[]) => {
  const [, command] = args as [string, string];
  if (command.includes('DROP DATABASE')) {
    if (command.includes('pr-456')) throw new Error('database is in use');
    return '';
  }
  return ['pr-123,postgres,UTF8,42 MB', 'pr-456,postgres,UTF8,7 MB'].join('\n');
});
vi.mock('../../services/fly', () => ({
  sshExec: (...a: unknown[]) => sshExec(...a)
}));

describe('db drop', () => {
  beforeEach(() => {
    sshExec.mockClear();
  });

  it('drops the selected databases and asks for the typed name on production', async () => {
    const command = (await import('./drop')).default;
    const exit = await runCommand({
      name: 'db drop',
      command,
      argv: [
        '--cluster',
        'pg-production',
        '--password',
        'super-secret',
        '--databases',
        'pr-123'
      ],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui: fakeUi(['pg-production']),
      history: () => undefined,
      stdout: () => undefined
    });

    expect(exit).toBe(EXIT.ok);
    expect(sshExec).toHaveBeenCalledWith(
      'pg-production',
      expect.stringContaining('DROP DATABASE IF EXISTS "pr-123" WITH (FORCE);')
    );
  });

  it('reports a partial result when one database fails to drop', async () => {
    const command = (await import('./drop')).default;
    const exit = await runCommand({
      name: 'db drop',
      command,
      argv: [
        '--cluster',
        'pg-preview',
        '--password',
        'super-secret',
        '--databases',
        'pr-123,pr-456',
        '--yes'
      ],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: true,
      ui: fakeUi([]),
      history: () => undefined,
      stdout: () => undefined
    });

    expect(exit).toBe(EXIT.failed);
  });
});
