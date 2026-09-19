import { render } from 'ink-testing-library';

import { defineCommand } from '../../cli/command';
import { EXIT } from '../../cli/errors';
import type { Entry, Group } from '../../cli/registry';

import { App } from './App';
import { createAppUi } from './app-ui';
import { RunStore } from './store';

const DOWN = '\u001b[B';
const ENTER = '\r';
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll until `check` holds, instead of a fixed delay. Ink re-renders on a
 * microtask after a keystroke or an async command step, and a busy CI
 * runner can take longer than any fixed sleep to get there - polling is
 * what stays reliable, not a bigger constant.
 */
async function waitFor(
  check: () => boolean,
  { timeoutMs = 2000, stepMs = 10 } = {}
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (check()) return;
    if (Date.now() >= deadline) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    }
    await tick(stepMs);
  }
}

const command = defineCommand({
  summary: 'Say hello',
  danger: 'read',
  inputs: {},
  plan: async () => ({ steps: [], data: null }),
  apply: async (ctx) => {
    ctx.ui.info('hello there');
    return { summary: 'Said hello' };
  }
});

const groups: Group[] = [{ name: 'db', summary: 'Database' }];
const entries: Entry[] = [
  {
    path: ['db', 'backup'],
    summary: 'Back up',
    danger: 'read',
    load: async () => command
  },
  {
    path: ['db', 'drop'],
    summary: 'Drop things',
    danger: 'destructive',
    load: async () => command
  },
  {
    path: ['doctor'],
    summary: 'Check',
    danger: 'read',
    load: async () => command
  }
];

const mount = (initial?: { entry: Entry; argv: string[] }) => {
  const store = new RunStore();
  const ui = createAppUi(store);
  const ran: string[] = [];
  const exits: number[] = [];
  const app = render(
    <App
      version="t"
      groups={groups}
      entries={entries}
      store={store}
      initial={initial}
      run={async (entry) => {
        ran.push(entry.path.join(' '));
        ui.intro(`cdwr ${entry.path.join(' ')}`);
        const cmd = await entry.load();
        await cmd.apply({ ui } as never, null, {});
        ui.outro('\u2714 Said hello');
        return EXIT.ok;
      }}
      onExit={(code) => exits.push(code)}
    />
  );
  return { ...app, store, ran, exits };
};

/** Cursor lands on a header row for one tick before an effect corrects it
 * to the first command; everything below waits for that settled state
 * (the backup card actually showing) before sending more keys. */
const waitUntilReady = (lastFrame: () => string | undefined) =>
  waitFor(() => (lastFrame() ?? '').includes('Back up'));

describe('App', () => {
  it('lists groups and commands with badges and shows the selected card', async () => {
    const { lastFrame } = mount();
    await waitUntilReady(lastFrame);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('backup');
    expect(frame).toContain('drop');
    expect(frame).toContain('!');
    expect(frame).toContain('Back up');
    expect(frame).toContain('read-only');
  });

  it('filters with / and runs the highlighted command on enter', async () => {
    const { stdin, lastFrame, ran } = mount();
    await waitUntilReady(lastFrame);
    stdin.write('/');
    await waitFor(() => (lastFrame() ?? '').includes('\u258f'));
    stdin.write('doc');
    await waitFor(() => {
      const frame = lastFrame() ?? '';
      return frame.includes('doctor') && !frame.includes('backup');
    });
    stdin.write(ENTER);
    // A check that is already true would let waitFor return without a
    // real tick, so the next ENTER could still land while filtering is
    // stale in the handler's closure - wait for the filter cursor to be
    // gone instead, which forces an actual re-render first.
    await waitFor(() => !(lastFrame() ?? '').includes('\u258f'));
    stdin.write(ENTER);
    await waitFor(() => ran.length > 0);
    await waitFor(() => (lastFrame() ?? '').includes('Done'));
    expect(ran).toEqual(['doctor']);
    expect(lastFrame()).toContain('hello there');
  });

  it('returns to the menu after a run and quits with q', async () => {
    const { stdin, lastFrame, exits } = mount();
    await waitUntilReady(lastFrame);
    stdin.write(DOWN);
    stdin.write(ENTER);
    await waitFor(() => (lastFrame() ?? '').includes('menu'));
    stdin.write(ENTER);
    // Cursor stays wherever it was (on 'drop' now); the footer's dry-run
    // hint is the reliable "we're back on the home screen" signal.
    await waitFor(() => (lastFrame() ?? '').includes('dry run'));
    stdin.write('q');
    await waitFor(() => exits.length > 0);
    expect(exits).toEqual([0]);
  });

  it('opens on the initial command and leaves when it is dismissed', async () => {
    const { stdin, lastFrame, exits, ran } = mount({
      entry: entries[2] as Entry,
      argv: []
    });
    await waitFor(() => (lastFrame() ?? '').includes('Done'));
    expect(ran).toEqual(['doctor']);
    stdin.write(ENTER);
    await waitFor(() => exits.length > 0);
    expect(exits).toEqual([0]);
  });
});
