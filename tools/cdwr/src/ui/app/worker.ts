import { parentPort } from 'node:worker_threads';

import { Cancelled, messageOf } from '../../cli/errors';
import { loadPrefs } from '../../cli/prefs';
import { nameOf } from '../../cli/registry';
import { runCommand } from '../../cli/run';
import { ENTRIES } from '../../commands';
import type { Ui } from '../ui';

import type { FromWorker, PromptRequest, ToWorker } from './protocol';
import type { PromptInput } from './store';

const port = parentPort;
if (!port) throw new Error('cdwr worker started outside a worker thread');

const post = (message: FromWorker) => port.postMessage(message);

let nextId = 1;
const pending = new Map<
  number,
  {
    validate?: (value: string) => string | undefined;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }
>();

/** Ask the app and wait; validation runs here, where the input's schema lives */
function ask<T>(
  prompt: PromptInput,
  validate?: (value: string) => string | undefined
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { validate, resolve: (v) => resolve(v as T), reject });
    post({ type: 'prompt', prompt: { ...prompt, id } as PromptRequest });
  });
}

/** The UI a command sees inside the worker: every call becomes a message */
const remoteUi: Ui = {
  interactive: true,
  intro: (title) => post({ type: 'intro', title }),
  outro: (text) => post({ type: 'line', level: 'info', text }),
  info: (text) => post({ type: 'line', level: 'info', text }),
  success: (text) => post({ type: 'line', level: 'success', text }),
  warn: (text) => post({ type: 'line', level: 'warn', text }),
  error: (text) => post({ type: 'line', level: 'error', text }),
  note: (body, title) =>
    post({
      type: 'note',
      title,
      lines: Array.isArray(body) ? body : body.split('\n')
    }),
  write: (text) => post({ type: 'raw', text }),
  table: (head, rows) => post({ type: 'table', head, rows }),
  async task(label, work, done) {
    const id = nextId++;
    post({ type: 'task-start', id, label });
    try {
      const result = await work();
      post({
        type: 'task-end',
        id,
        state: 'done',
        text: done ? done(result) : undefined
      });
      return result;
    } catch (error) {
      post({ type: 'task-end', id, state: 'failed', text: messageOf(error) });
      throw error;
    }
  },
  select: ({ message, choices, initial }) =>
    ask({ kind: 'select', message, choices, initial }),
  multiselect: ({ message, choices, initial, min }) =>
    ask({ kind: 'multiselect', message, choices, initial, min }),
  text: ({ message, placeholder, initial, validate }) =>
    ask({ kind: 'text', message, placeholder, initial }, validate),
  password: ({ message, validate }) =>
    ask({ kind: 'password', message }, validate),
  confirm: ({ message, initial }) => ask({ kind: 'confirm', message, initial })
};

async function run(path: string[], argv: string[], root: string) {
  const entry = ENTRIES.find((e) => nameOf(e) === path.join(' '));
  if (!entry) {
    post({ type: 'crash', message: `No command '${path.join(' ')}'` });
    return;
  }
  try {
    const command = await entry.load();
    const code = await runCommand({
      name: nameOf(entry),
      command,
      argv,
      root,
      env: process.env,
      prefs: loadPrefs(),
      interactive: true,
      ui: remoteUi,
      stdout: (text) => remoteUi.write(text)
    });
    post({ type: 'done', code });
  } catch (error) {
    post({ type: 'crash', message: messageOf(error) });
  }
}

port.on('message', (message: ToWorker) => {
  switch (message.type) {
    case 'run':
      void run(message.path, message.argv, message.root);
      break;
    case 'answer': {
      const waiting = pending.get(message.id);
      if (!waiting) return;
      const problem =
        typeof message.value === 'string'
          ? waiting.validate?.(message.value)
          : undefined;
      if (problem) {
        post({ type: 'prompt-error', id: message.id, error: problem });
        return;
      }
      pending.delete(message.id);
      post({ type: 'prompt-done', id: message.id });
      waiting.resolve(message.value);
      break;
    }
    case 'cancel': {
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      waiting.reject(new Cancelled());
      break;
    }
  }
});
