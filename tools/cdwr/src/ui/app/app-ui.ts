import { messageOf } from '../../cli/errors';
import type { Ui } from '../ui';

import type { RunStore } from './store';

/** The UI commands talk to inside the app: everything lands in the run pane */
export function createAppUi(store: RunStore): Ui {
  return {
    interactive: true,

    intro: (title) => store.start(title),
    outro: (text) => store.push({ kind: 'line', level: 'info', text }),
    info: (text) => store.push({ kind: 'line', level: 'info', text }),
    success: (text) => store.push({ kind: 'line', level: 'success', text }),
    warn: (text) => store.push({ kind: 'line', level: 'warn', text }),
    error: (text) => store.push({ kind: 'line', level: 'error', text }),
    note: (body, title) =>
      store.push({
        kind: 'note',
        title,
        lines: Array.isArray(body) ? body : body.split('\n')
      }),
    write: (text) => store.push({ kind: 'raw', text }),
    table: (head, rows) => store.push({ kind: 'table', head, rows }),

    async task(label, work, done) {
      const id = store.task(label);
      try {
        const result = await work();
        store.finish(id, 'done', done ? done(result) : undefined);
        return result;
      } catch (error) {
        store.finish(id, 'failed', messageOf(error));
        throw error;
      }
    },

    select: ({ message, choices, initial }) =>
      store.ask({ kind: 'select', message, choices, initial }),
    multiselect: ({ message, choices, initial, min }) =>
      store.ask({ kind: 'multiselect', message, choices, initial, min }),
    text: ({ message, placeholder, initial, validate }) =>
      store.ask({ kind: 'text', message, placeholder, initial }, validate),
    password: ({ message, validate }) =>
      store.ask({ kind: 'password', message }, validate),
    confirm: ({ message, initial }) =>
      store.ask({ kind: 'confirm', message, initial })
  };
}
