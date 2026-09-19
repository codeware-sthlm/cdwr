import { Worker } from 'node:worker_threads';

import { EXIT } from '../../cli/errors';
import type { Entry } from '../../cli/registry';

import type { FromWorker, ToWorker } from './protocol';
import type { RunStore } from './store';

export interface Bridge {
  /** Run one command in the worker; resolves to its exit code */
  run(entry: Entry, argv: string[], root: string): Promise<number>;
  /** Stop everything: the worker and whatever it spawned */
  abort(): void;
}

/** A worker-like thing the bridge can drive; `Worker` in production, a fake in tests */
export interface WorkerLike {
  postMessage(message: ToWorker): void;
  on(event: 'message', listener: (message: FromWorker) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
  terminate(): Promise<number> | void;
}

const WORKER = new URL('./worker-boot.mjs', import.meta.url);

/** One worker for the app's lifetime, started on the first run */
export const spawnWorker = (): WorkerLike =>
  new Worker(WORKER, {
    // Whatever a command or a library prints stays off the screen
    stdout: true,
    stderr: true
  });

/**
 * Turns worker messages into store updates and store answers into worker
 * messages. The store's prompts resolve through here, so an answer is only
 * final once the worker has validated it.
 */
export function createBridge(
  store: RunStore,
  spawn: () => WorkerLike = spawnWorker
): Bridge {
  let worker: WorkerLike | undefined;
  const children = new Set<number>();
  let finish: ((code: number) => void) | undefined;

  const send = (message: ToWorker) => worker?.postMessage(message);

  const handle = (message: FromWorker) => {
    switch (message.type) {
      case 'intro':
        return store.start(message.title);
      case 'line':
        return store.push({
          kind: 'line',
          level: message.level,
          text: message.text
        });
      case 'note':
        return store.push({
          kind: 'note',
          title: message.title,
          lines: message.lines
        });
      case 'table':
        return store.push({
          kind: 'table',
          head: message.head,
          rows: message.rows
        });
      case 'raw':
        return store.push({ kind: 'raw', text: message.text });
      case 'task-start':
        return store.taskWithId(message.id, message.label);
      case 'task-end':
        return store.finish(message.id, message.state, message.text);
      case 'prompt': {
        const { id, ...prompt } = message.prompt;
        return store.open(id, prompt, {
          answer: (value) => send({ type: 'answer', id, value }),
          cancel: () => send({ type: 'cancel', id })
        });
      }
      case 'prompt-error':
        return store.promptError(message.id, message.error);
      case 'prompt-done':
        return store.close(message.id);
      case 'child':
        return children.add(message.pid);
      case 'done':
        return finish?.(message.code);
      case 'crash':
        store.push({ kind: 'line', level: 'error', text: message.message });
        return finish?.(EXIT.failed);
    }
  };

  const ensure = (): WorkerLike => {
    if (worker) return worker;
    worker = spawn();
    worker.on('message', handle);
    worker.on('error', (error) => {
      store.push({ kind: 'line', level: 'error', text: error.message });
      finish?.(EXIT.failed);
    });
    worker.on('exit', () => {
      worker = undefined;
      finish?.(EXIT.failed);
    });
    return worker;
  };

  return {
    run: (entry, argv, root) =>
      new Promise<number>((resolve) => {
        finish = (code) => {
          finish = undefined;
          resolve(code);
        };
        ensure().postMessage({ type: 'run', path: entry.path, argv, root });
      }),
    abort() {
      for (const pid of children) {
        try {
          process.kill(pid);
        } catch {
          // already gone
        }
      }
      void worker?.terminate();
      worker = undefined;
    }
  };
}
