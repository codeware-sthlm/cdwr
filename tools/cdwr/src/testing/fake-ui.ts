import { Cancelled } from '../cli/errors';
import type { Ui } from '../ui/ui';

export type Answer = string | string[] | boolean | 'cancel';

export interface FakeUi extends Ui {
  /** Every prompt message asked, in order */
  asked: string[];
  /** Everything printed, by channel */
  printed: {
    intro: string[];
    outro: string[];
    info: string[];
    warn: string[];
    error: string[];
    note: string[];
    write: string[];
  };
}

/**
 * A UI that answers prompts from a queue and records what was printed.
 * `'cancel'` as an answer throws `Cancelled`, like ctrl-c would.
 */
export function fakeUi(answers: Answer[] = [], interactive = true): FakeUi {
  const queue = [...answers];
  const asked: string[] = [];
  const printed: FakeUi['printed'] = {
    intro: [],
    outro: [],
    info: [],
    warn: [],
    error: [],
    note: [],
    write: []
  };

  const next = <T>(message: string): T => {
    asked.push(message);
    if (queue.length === 0)
      throw new Error(`No answer queued for "${message}"`);
    const answer = queue.shift();
    if (answer === 'cancel') throw new Cancelled();
    return answer as T;
  };

  return {
    interactive,
    asked,
    printed,
    intro: (t) => printed.intro.push(t),
    outro: (t) => printed.outro.push(t),
    info: (t) => printed.info.push(t),
    success: (t) => printed.info.push(t),
    warn: (t) => printed.warn.push(t),
    error: (t) => printed.error.push(t),
    note: (body, title) =>
      printed.note.push(
        `${title ?? ''}:${Array.isArray(body) ? body.join('|') : body}`
      ),
    write: (t) => printed.write.push(t),
    task: (_label, work) => work(),
    table: (head, rows) =>
      printed.write.push([head, ...rows].map((r) => r.join(',')).join('\n')),
    select: async ({ message }) => next(message),
    multiselect: async ({ message }) => next(message),
    text: async ({ message, validate }) => {
      const answer = next<string>(message);
      const problem = validate?.(answer);
      if (problem) throw new Error(`Invalid answer "${answer}": ${problem}`);
      return answer;
    },
    password: async ({ message }) => next(message),
    confirm: async ({ message }) => next(message)
  };
}
