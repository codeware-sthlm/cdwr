import { appendFileSync } from 'node:fs';

import { render } from 'ink';

const dbg = (m: string) => appendFileSync('/tmp/cdwr-exit.log', m + '\n');
process.on('exit', (c) => dbg('process exit ' + c));
process.on('uncaughtException', (e) => dbg('uncaught ' + String(e)));
process.on('unhandledRejection', (e) => dbg('unhandled ' + String(e)));

import { unmutedWrite } from '../../cli/muted';
import type { Entry, Group } from '../../cli/registry';

import { App } from './App';
import { createBridge } from './bridge';
import { RunStore } from './store';

export interface LaunchOptions {
  version: string;
  groups: Group[];
  entries: Entry[];
  root: string;
  initial?: { entry: Entry; argv: string[] };
}

const ALT_SCREEN_ON = '\u001b[?1049h\u001b[H';
const ALT_SCREEN_OFF = '\u001b[?1049l';

/** Show the app on the alternate screen until the user leaves it */
export async function launchApp(options: LaunchOptions): Promise<number> {
  const store = new RunStore();
  // Commands run in a worker thread, so a blocking one never freezes the screen
  const bridge = createBridge(store);
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
      run={(entry, argv) => bridge.run(entry, argv, options.root)}
      abort={() => bridge.abort()}
      initial={options.initial}
      onExit={(c) => {
        dbg('onExit ' + c);
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
  dbg('rendered');
  try {
    await instance.waitUntilExit();
    dbg('after waitUntilExit');
  } finally {
    dbg('finally');
    bridge.abort();
    process.stdout.write(ALT_SCREEN_OFF);
    // Ink leaves stdin flowing, which keeps the process alive after the app is gone
    process.stdin.pause();
  }
  return code;
}
