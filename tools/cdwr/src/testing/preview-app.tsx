/**
 * Render the app without a terminal and print frames after each key, for a
 * look at the layout from a script or a test:
 *
 *   pnpm tsx --tsconfig tools/cdwr/tsconfig.lib.json tools/cdwr/src/testing/preview-app.tsx down down enter
 *
 * Keys: up, down, left, right, enter, esc, space, or any single character.
 */
import { render } from 'ink-testing-library';

import { EXIT } from '../cli/errors';
import { memoryPrefs } from '../cli/prefs';
import { runCommand } from '../cli/run';
import { loadWorkspace } from '../cli/workspace';
import { ENTRIES, GROUPS } from '../commands';
import { App } from '../ui/app/App';
import { createAppUi } from '../ui/app/app-ui';
import { RunStore } from '../ui/app/store';

const KEYS: Record<string, string> = {
  up: '\u001b[A',
  down: '\u001b[B',
  right: '\u001b[C',
  left: '\u001b[D',
  enter: '\r',
  esc: '\u001b',
  space: ' '
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(args: string[]) {
  const workspace = loadWorkspace();
  const initialName = args[0] === '--initial' ? args[1] : undefined;
  const keys = initialName ? args.slice(2) : args;
  const initialEntry = ENTRIES.find((e) => e.path.join(' ') === initialName);
  const store = new RunStore();
  const ui = createAppUi(store);
  let exitCode: number | undefined;
  const app = render(
    <App
      version="preview"
      groups={GROUPS}
      entries={ENTRIES}
      store={store}
      initial={initialEntry ? { entry: initialEntry, argv: [] } : undefined}
      run={async (entry, argv) =>
        runCommand({
          name: entry.path.join(' '),
          command: await entry.load(),
          argv,
          root: workspace.root,
          env: process.env,
          prefs: memoryPrefs(),
          interactive: true,
          ui,
          history: () => undefined,
          stdout: (t) => ui.write(t)
        })
      }
      onExit={(code) => {
        exitCode = code;
      }}
    />
  );
  await sleep(200);
  process.stdout.write(`${app.lastFrame() ?? ''}\n${'═'.repeat(80)}\n`);
  for (const key of keys) {
    app.stdin.write(KEYS[key] ?? key);
    await sleep(400);
    process.stdout.write(
      `[${key}]\n${app.lastFrame() ?? ''}\n${'═'.repeat(80)}\n`
    );
  }
  app.unmount();
  process.exit(exitCode ?? EXIT.ok);
}

main(process.argv.slice(2));
