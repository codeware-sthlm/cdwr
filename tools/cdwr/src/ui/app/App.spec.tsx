import { render } from 'ink-testing-library';

import { defineCommand } from '../../cli/command';
import { EXIT } from '../../cli/errors';
import type { Entry, Group } from '../../cli/registry';

import { App } from './App';
import { createAppUi } from './app-ui';
import { RunStore } from './store';

const DOWN = '\u001b[B';
const ENTER = '\r';
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

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
        ui.outro('✔ Said hello');
        return EXIT.ok;
      }}
      onExit={(code) => exits.push(code)}
    />
  );
  return { ...app, store, ran, exits };
};

describe('App', () => {
  it('lists groups and commands with badges and shows the selected card', async () => {
    const { lastFrame } = mount();
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('❯ backup');
    expect(frame).toContain('drop');
    expect(frame).toContain('!');
    expect(frame).toContain('Back up');
    expect(frame).toContain('read-only');
  });

  it('filters with / and runs the highlighted command on enter', async () => {
    const { stdin, lastFrame, ran } = mount();
    await tick();
    stdin.write('/');
    await tick();
    stdin.write('doc');
    await tick();
    expect(lastFrame()).toContain('❯ doctor');
    expect(lastFrame()).not.toContain('backup');
    stdin.write(ENTER);
    await tick();
    stdin.write(ENTER);
    await tick(80);
    expect(ran).toEqual(['doctor']);
    expect(lastFrame()).toContain('hello there');
    expect(lastFrame()).toContain('Done');
  });

  it('returns to the menu after a run and quits with q', async () => {
    const { stdin, lastFrame, exits } = mount();
    await tick();
    stdin.write(DOWN);
    stdin.write(ENTER);
    await tick(80);
    expect(lastFrame()).toContain('⏎ menu');
    stdin.write(ENTER);
    await tick();
    expect(lastFrame()).toContain('⏎ run');
    stdin.write('q');
    await tick();
    expect(exits).toEqual([0]);
  });

  it('opens on the initial command and leaves when it is dismissed', async () => {
    const { stdin, lastFrame, exits, ran } = mount({
      entry: entries[2] as Entry,
      argv: []
    });
    await tick(80);
    expect(ran).toEqual(['doctor']);
    expect(lastFrame()).toContain('Done');
    stdin.write(ENTER);
    await tick();
    expect(exits).toEqual([0]);
  });
});
