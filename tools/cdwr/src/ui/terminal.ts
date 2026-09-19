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
import Table from 'cli-table3';

import { Cancelled, messageOf } from '../cli/errors';

import { symbols, theme } from './theme';
import type {
  ConfirmOptions,
  MultiselectOptions,
  SelectOptions,
  TextOptions,
  Ui
} from './ui';

const unwrap = <T>(value: T | symbol): T => {
  if (isCancel(value)) throw new Cancelled();
  return value as T;
};

/** The interactive UI: clack prompts, spinners and notes */
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
      const table = new Table({
        head: head.map((h) => theme.title(h)),
        style: { head: [], border: [] },
        chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' }
      });
      for (const row of rows) table.push(row);
      process.stdout.write(`${table.toString()}\n`);
    },

    select: async <T extends string>({
      message,
      choices,
      initial
    }: SelectOptions<T>) =>
      unwrap(
        await select<string>({
          message,
          options: choices.map((c) => ({
            value: c.value,
            label: c.label ?? c.value,
            hint: c.hint
          })),
          initialValue: initial
        })
      ) as T,

    multiselect: async <T extends string>({
      message,
      choices,
      initial,
      min
    }: MultiselectOptions<T>) =>
      unwrap(
        await multiselect<string>({
          message,
          options: choices.map((c) => ({
            value: c.value,
            label: c.label ?? c.value,
            hint: c.hint
          })),
          initialValues: initial,
          required: (min ?? 0) > 0
        })
      ) as T[],

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
