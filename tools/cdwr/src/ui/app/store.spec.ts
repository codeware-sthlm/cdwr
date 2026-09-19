import { Cancelled } from '../../cli/errors';

import { createAppUi } from './app-ui';
import { RunStore } from './store';

describe('RunStore', () => {
  it('notifies subscribers and keeps the log in order', () => {
    const store = new RunStore();
    const seen: number[] = [];
    store.subscribe(() => seen.push(store.snapshot()?.log.length ?? -1));
    store.start('cdwr x');
    const id = store.task('Reading');
    store.push({ kind: 'line', level: 'info', text: 'hello' });
    store.finish(id, 'done', 'Read 3');
    expect(store.snapshot()?.log).toEqual([
      { kind: 'task', id, label: 'Reading', state: 'done', text: 'Read 3' },
      { kind: 'line', level: 'info', text: 'hello' }
    ]);
    expect(seen).toEqual([0, 1, 2, 2]);
  });

  it('turns a prompt into a promise the form answers', async () => {
    const store = new RunStore();
    store.start('cdwr x');
    const answer = store.ask<string>({
      kind: 'select',
      message: 'Which?',
      choices: [{ value: 'a' }, { value: 'b' }]
    });
    const prompt = store.snapshot()?.prompt;
    expect(prompt?.kind).toBe('select');
    prompt?.resolve('b');
    await expect(answer).resolves.toBe('b');
    expect(store.snapshot()?.prompt).toBeUndefined();
    expect(store.snapshot()?.answered).toEqual([
      { message: 'Which?', shown: 'b' }
    ]);
  });

  it('masks answered passwords and rejects on cancel', async () => {
    const store = new RunStore();
    store.start('cdwr x');
    const secret = store.ask<string>({ kind: 'password', message: 'Token?' });
    store.snapshot()?.prompt?.resolve('hunter22');
    await secret;
    expect(store.snapshot()?.answered[0]?.shown).toBe('••••••');

    const cancelled = store.ask<boolean>({ kind: 'confirm', message: 'Go?' });
    store.snapshot()?.prompt?.reject(new Cancelled());
    await expect(cancelled).rejects.toBeInstanceOf(Cancelled);
    expect(store.snapshot()?.prompt).toBeUndefined();
  });
});

describe('createAppUi', () => {
  it('routes every call into the store', async () => {
    const store = new RunStore();
    const ui = createAppUi(store);
    ui.intro('cdwr y');
    ui.note(['a', 'b'], 'Plan');
    ui.table(['h'], [['v']]);
    const value = await ui.task(
      'Work',
      async () => 42,
      (n) => `got ${n}`
    );
    expect(value).toBe(42);
    await expect(
      ui.task('Boom', async () => {
        throw new Error('nope');
      })
    ).rejects.toThrow('nope');
    expect(store.snapshot()?.log).toEqual([
      { kind: 'note', title: 'Plan', lines: ['a', 'b'] },
      { kind: 'table', head: ['h'], rows: [['v']] },
      { kind: 'task', id: 1, label: 'Work', state: 'done', text: 'got 42' },
      { kind: 'task', id: 2, label: 'Boom', state: 'failed', text: 'nope' }
    ]);
  });
});
