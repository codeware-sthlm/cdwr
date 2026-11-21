import {
  confirm,
  intro,
  isCancel,
  log,
  multiselect,
  note,
  outro,
  password,
  select,
  spinner,
  text
} from '@clack/prompts';

import { Cancelled, messageOf } from '../cli/errors';
import type { Choice } from '../cli/inputs';

import { createTable } from './table';
import { outputWidth, tableLayout } from './table-layout';
import { symbols, theme } from './theme';
import type {
  ConfirmOptions,
  MultiselectOptions,
  SelectOptions,
  TextOptions,
  Ui
} from './ui';

const unwrap = <T extends string | boolean | string[]>(
  value: T | symbol
): T => {
  if (isCancel(value)) throw new Cancelled();
  return value;
};

const toOption = (c: Choice<string>) => ({
  value: c.value,
  label: c.label ?? c.value,
  ...(c.hint ? { hint: c.hint } : {})
});

/** Inline prompts, spinners and notes for a command run on a terminal outside the app */
export function createTerminalUi(): Ui {
  return {
    interactive: true,

    intro: (title) =>
      intro(theme.brand(`${symbols.cloud} `) + theme.title(title)),
    outro: (message) => outro(message),
    info: (message) => log.info(message),
    success: (message) => log.success(message),
    warn: (message) => log.warn(message),
    error: (message) => log.error(message),
    note: (body, title) =>
      note(Array.isArray(body) ? body.join('\n') : body, title),
    write: (content) => process.stdout.write(`${content}\n`),

    async task(label, work, done) {
      const s = spinner();
      s.start(label);
      try {
        const result = await work();
        s.stop(done ? done(result) : label);
        return result;
      } catch (error) {
        s.stop(`${label} ${theme.danger(messageOf(error))}`, 1);
        throw error;
      }
    },

    table(head, rows) {
      const width = outputWidth(80);
      const table = createTable(head, rows, {
        colWidths: tableLayout(head, rows, width),
        wordWrap: true
      });
      process.stdout.write(`${table.toString()}\n`);
    },

    async select<T extends string>({
      message,
      choices,
      initial
    }: SelectOptions<T>): Promise<T> {
      const picked = unwrap(
        await select<string>({
          message,
          options: choices.map(toOption),
          initialValue: initial
        })
      );
      // The picked value is one of `choices`; returning that keeps its type
      const choice = choices.find((c) => c.value === picked);
      if (!choice) throw new Cancelled();
      return choice.value;
    },

    async multiselect<T extends string>({
      message,
      choices,
      initial,
      min
    }: MultiselectOptions<T>): Promise<T[]> {
      const picked = unwrap(
        await multiselect<string>({
          message,
          options: choices.map(toOption),
          initialValues: initial,
          required: (min ?? 0) > 0
        })
      );
      return choices
        .filter((c) => picked.includes(c.value))
        .map((c) => c.value);
    },

    text: async ({ message, placeholder, initial, validate }: TextOptions) =>
      unwrap(
        await text({
          message,
          placeholder,
          initialValue: initial,
          validate: validate ? (v) => validate(v ?? '') : undefined
        })
      ),

    password: async ({ message, validate }: TextOptions) =>
      unwrap(
        await password({
          message,
          mask: '•',
          validate: validate ? (v) => validate(v ?? '') : undefined
        })
      ),

    confirm: async ({ message, initial }: ConfirmOptions) =>
      unwrap(await confirm({ message, initialValue: initial ?? false }))
  };
}
