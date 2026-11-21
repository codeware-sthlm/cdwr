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
 * Poll until `check` holds, instead of a fixed delay. `lastFrame()`
 * reflects the committed render, but Ink's `useInput` re-subscribes its
 * handler in a plain `useEffect`, which React flushes after the commit,
 * not synchronously with it - a key sent the instant a frame looks right
 * can still land on the previous render's handler. `waitFor` gives that
 * effect one more tick before returning, on top of a generous timeout:
 * Nx runs this project's typecheck, lint and test targets concurrently
 * (locally via `run-many`, always in CI), and that alone can delay a
 * commit by real seconds.
 */
async function waitFor(
  check: () => boolean,
  { timeoutMs = 20000, stepMs = 10 } = {}
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (check()) {
      await tick();
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    }
    await tick(stepMs);
  }
}

/**
 * Send a key and yield at least one real event-loop turn before the next
 * one. `useInput`'s state updates are batched and committed asynchronously
 * by React's scheduler; two `stdin.write()` calls issued back to back can
 * both run against the same pre-update closure, so every key here gets its
 * own tick rather than relying on timing coincidence.
 */
async function press(stdin: { write: (data: string) => void }, key: string) {
  stdin.write(key);
  await tick();
}

const command = defineCommand({
  summary: 'Say hello',
  description: 'Test command',
  danger: 'read',
  inputs: {},
  plan: async () => ({ steps: [], data: null }),
  apply: async (ctx) => {
    ctx.ui.info('hello there');
    return { summary: 'Said hello' };
  }
});

const noisy = defineCommand({
  summary: 'Log a lot',
  description: 'Test command',
  danger: 'read',
  inputs: {},
  plan: async () => ({ steps: [], data: null }),
  apply: async (ctx) => {
    for (let i = 1; i <= 40; i++) ctx.ui.info(`line ${i}`);
    ctx.ui.info(`long ${'x'.repeat(300)}`);
    return { summary: 'Said a lot' };
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
    path: ['db', 'spill'],
    summary: 'Log a lot',
    danger: 'read',
    load: async () => noisy
  },
  {
    path: ['doctor'],
    summary: 'Check',
    danger: 'read',
    load: async () => command
  }
];

const mount = (size?: { rows: number }) => {
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
  if (size) {
    Object.assign(app.stdout, { rows: size.rows });
    app.stdout.emit('resize');
  }
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
  }, 25000);

  it('filters with / and runs the highlighted command on enter', async () => {
    const { stdin, lastFrame, ran } = mount();
    await waitUntilReady(lastFrame);
    await press(stdin, '/');
    await waitFor(() => (lastFrame() ?? '').includes('\u258f'));
    for (const char of 'doc') await press(stdin, char);
    await waitFor(() => {
      const frame = lastFrame() ?? '';
      return frame.includes('doctor') && !frame.includes('backup');
    });
    await press(stdin, ENTER);
    // A check that is already true would let waitFor return without a
    // real tick, so the next key could still land while filtering is
    // stale in the handler's closure - wait for the filter cursor to be
    // gone instead, which forces an actual re-render first.
    await waitFor(() => !(lastFrame() ?? '').includes('\u258f'));
    await press(stdin, ENTER);
    await waitFor(() => ran.length > 0);
    await waitFor(() => (lastFrame() ?? '').includes('Done'));
    expect(ran).toEqual(['doctor']);
    expect(lastFrame()).toContain('hello there');
  }, 90000);

  it('returns to the menu after a run and quits with q', async () => {
    const { stdin, lastFrame, exits } = mount();
    await waitUntilReady(lastFrame);
    await press(stdin, DOWN);
    await press(stdin, ENTER);
    await waitFor(() => (lastFrame() ?? '').includes('menu'));
    await press(stdin, ENTER);
    // Cursor stays wherever it was (on 'drop' now); the footer's dry-run
    // hint is the reliable "we're back on the home screen" signal.
    await waitFor(() => (lastFrame() ?? '').includes('dry run'));
    await press(stdin, 'q');
    await waitFor(() => exits.length > 0);
    expect(exits).toEqual([0]);
  }, 90000);

  it('keeps a long run inside the pane, scrolls it and follows again with G', async () => {
    const { stdin, lastFrame } = mount({ rows: 20 });
    await waitUntilReady(lastFrame);
    await press(stdin, DOWN);
    await press(stdin, DOWN);
    // The cursor must have moved before Enter, or another command runs
    await waitFor(() => (lastFrame() ?? '').includes('❯ spill'));
    await press(stdin, ENTER);
    await waitFor(() => (lastFrame() ?? '').includes('Done'));

    const lines = (lastFrame() ?? '').split('\n');
    expect(lines.length).toBeLessThanOrEqual(20);
    const done = lines.findIndex((l) => l.includes('Done'));
    expect(lines.slice(done).some((l) => /line \d|long x/.test(l))).toBe(false);
    // The card's bottom border is drawn, so nothing was clipped
    expect(lines.slice(done).some((l) => l.includes('╰'))).toBe(true);
    expect(lastFrame()).toContain('long xxx');

    await press(stdin, 'g');
    await waitFor(() => (lastFrame() ?? '').includes('more below'));
    expect(lastFrame()).toContain('line 1');
    expect((lastFrame() ?? '').split('\n').length).toBeLessThanOrEqual(20);
    expect(lastFrame()).not.toContain('long xxx');

    await press(stdin, 'G');
    await waitFor(() => !(lastFrame() ?? '').includes('more below'));
    expect(lastFrame()).toContain('long xxx');
    expect(lastFrame()).toContain('Done');
    expect(lastFrame()).toContain('╰');
  }, 90000);
});
