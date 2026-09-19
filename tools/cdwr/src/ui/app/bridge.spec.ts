import { EventEmitter } from 'node:events';

import { EXIT } from '../../cli/errors';
import type { Entry } from '../../cli/registry';

import { type WorkerLike, createBridge } from './bridge';
import type { FromWorker, ToWorker } from './protocol';
import { RunStore } from './store';

class FakeWorker extends EventEmitter implements WorkerLike {
  sent: ToWorker[] = [];
  terminated = false;
  postMessage(message: ToWorker) {
    this.sent.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  say(message: FromWorker) {
    this.emit('message', message);
  }
}

const entry: Entry = {
  path: ['db', 'backup'],
  summary: '',
  danger: 'read',
  load: () => Promise.reject(new Error('unused'))
};

describe('createBridge', () => {
  it('starts the worker on the first run and mirrors its log into the store', async () => {
    const store = new RunStore();
    const worker = new FakeWorker();
    const bridge = createBridge(store, () => worker);
    const run = bridge.run(entry, ['--env', 'x'], '/repo');
    expect(worker.sent).toEqual([
      {
        type: 'run',
        path: ['db', 'backup'],
        argv: ['--env', 'x'],
        root: '/repo'
      }
    ]);

    worker.say({ type: 'intro', title: 'cdwr db backup' });
    worker.say({ type: 'task-start', id: 7, label: 'Reading' });
    worker.say({ type: 'task-end', id: 7, state: 'done', text: 'Read' });
    worker.say({ type: 'note', title: 'Plan', lines: ['a'] });
    worker.say({ type: 'done', code: EXIT.ok });

    expect(await run).toBe(EXIT.ok);
    expect(store.snapshot()?.title).toBe('cdwr db backup');
    expect(store.snapshot()?.log).toEqual([
      { kind: 'task', id: 7, label: 'Reading', state: 'done', text: 'Read' },
      { kind: 'note', title: 'Plan', lines: ['a'] }
    ]);
  });

  it('routes a prompt answer to the worker and keeps it open until accepted', () => {
    const store = new RunStore();
    const worker = new FakeWorker();
    const bridge = createBridge(store, () => worker);
    void bridge.run(entry, [], '/repo');
    worker.say({ type: 'intro', title: 'x' });
    worker.say({
      type: 'prompt',
      prompt: { id: 3, kind: 'text', message: 'Name?' }
    });

    store.snapshot()?.prompt?.resolve('ab');
    expect(worker.sent.at(-1)).toEqual({ type: 'answer', id: 3, value: 'ab' });
    worker.say({ type: 'prompt-error', id: 3, error: 'Too short' });
    expect(store.snapshot()?.prompt?.error).toBe('Too short');

    store.snapshot()?.prompt?.resolve('abc');
    worker.say({ type: 'prompt-done', id: 3 });
    expect(store.snapshot()?.prompt).toBeUndefined();
    expect(store.snapshot()?.answered).toEqual([
      { message: 'Name?', shown: 'abc' }
    ]);
  });

  it('cancels a prompt through the worker and ends on a crash', async () => {
    const store = new RunStore();
    const worker = new FakeWorker();
    const bridge = createBridge(store, () => worker);
    const run = bridge.run(entry, [], '/repo');
    worker.say({
      type: 'prompt',
      prompt: { id: 1, kind: 'confirm', message: 'Go?' }
    });
    store.snapshot()?.prompt?.reject(new Error('esc'));
    expect(worker.sent.at(-1)).toEqual({ type: 'cancel', id: 1 });
    expect(store.snapshot()?.prompt).toBeUndefined();

    worker.say({ type: 'crash', message: 'boom' });
    expect(await run).toBe(EXIT.failed);
    expect(store.snapshot()?.log.at(-1)).toEqual({
      kind: 'line',
      level: 'error',
      text: 'boom'
    });
  });

  it('kills reported children and the worker on abort', () => {
    const store = new RunStore();
    const worker = new FakeWorker();
    const bridge = createBridge(store, () => worker);
    void bridge.run(entry, [], '/repo');
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    worker.say({ type: 'child', pid: 4242 });
    bridge.abort();
    expect(kill).toHaveBeenCalledWith(4242);
    expect(worker.terminated).toBe(true);
    kill.mockRestore();
  });
});
