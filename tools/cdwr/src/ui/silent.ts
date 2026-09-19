import { UsageError } from '../cli/errors';

import type { Ui } from './ui';

const noPrompt = (what: string) => async () => {
  throw new UsageError(
    `Cannot ask "${what}" without a terminal`,
    'Pass the value as a flag, or drop --json / --non-interactive'
  );
};

/** Prints nothing and never prompts; `--json` output is written by the runtime */
export function createSilentUi(
  stderr: (line: string) => void = () => undefined
): Ui {
  const noop = () => undefined;
  return {
    interactive: false,
    intro: noop,
    outro: noop,
    info: noop,
    success: noop,
    warn: (message) => stderr(message),
    error: (message) => stderr(message),
    note: noop,
    write: noop,
    task: (_label, work) => work(),
    table: noop,
    select: noPrompt('select') as Ui['select'],
    multiselect: noPrompt('multiselect') as Ui['multiselect'],
    text: noPrompt('text') as Ui['text'],
    password: noPrompt('password') as Ui['password'],
    confirm: noPrompt('confirm') as Ui['confirm']
  };
}
