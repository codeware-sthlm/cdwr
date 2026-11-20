import type { AnyCommand } from '../../cli/command';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

/** Runs a command and returns its exit code with everything it printed as one string */
export async function runSecretCommand(
  name: string,
  command: AnyCommand,
  argv: string[]
) {
  const ui = fakeUi([], false);
  const lines: string[] = [];
  const code = await runCommand({
    name,
    command,
    argv: argv.includes('--json') ? argv : [...argv, '--json'],
    root: '/repo',
    env: {},
    prefs: memoryPrefs(),
    interactive: false,
    ui,
    history: () => undefined,
    stdout: (text) => lines.push(text)
  });
  const out = [...lines, JSON.stringify(ui.printed)].join('\n');
  return { code, out, lines };
}
