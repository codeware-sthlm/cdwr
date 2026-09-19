import { render } from 'ink';

import { unmutedWrite } from '../../cli/muted';
import type { Entry, Group } from '../../cli/registry';
import type { Ui } from '../ui';

import { App } from './App';
import { createAppUi } from './app-ui';
import { RunStore } from './store';

export interface LaunchOptions {
  version: string;
  groups: Group[];
  entries: Entry[];
  /** Runs one command with the given UI; resolves to its exit code */
  run: (entry: Entry, argv: string[], ui: Ui) => Promise<number>;
  initial?: { entry: Entry; argv: string[] };
}

const ALT_SCREEN_ON = '\u001b[?1049h\u001b[H';
const ALT_SCREEN_OFF = '\u001b[?1049l';

/** Show the app on the alternate screen until the user leaves it */
export async function launchApp(options: LaunchOptions): Promise<number> {
  const store = new RunStore();
  const ui = createAppUi(store);
  let code = 0;

  process.stdout.write(ALT_SCREEN_ON);
  // Libs get muted around their calls; Ink must keep drawing regardless
  const write = unmutedWrite();
  const stdout = new Proxy(process.stdout, {
    get: (target, prop, receiver) =>
      prop === 'write' ? write : Reflect.get(target, prop, receiver)
  });
  const instance = render(
    <App
      version={options.version}
      groups={options.groups}
      entries={options.entries}
      store={store}
      run={(entry, argv) => options.run(entry, argv, ui)}
      initial={options.initial}
      onExit={(c) => {
        code = c;
      }}
    />,
    {
      stdout,
      exitOnCtrlC: false,
      patchConsole: false,
      // The protocol query stalls until the terminal answers, and plain keys are enough here
      kittyKeyboard: { mode: 'disabled' }
    }
  );
  try {
    await instance.waitUntilExit();
  } finally {
    process.stdout.write(ALT_SCREEN_OFF);
    // Ink leaves stdin flowing, which keeps the process alive after the app is gone
    process.stdin.pause();
  }
  return code;
}
