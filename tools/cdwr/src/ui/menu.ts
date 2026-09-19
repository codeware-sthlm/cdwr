import type { Danger } from '../cli/command';
import { Cancelled } from '../cli/errors';
import type { Choice } from '../cli/inputs';
import type { Entry, Group } from '../cli/registry';

import { symbols, theme } from './theme';
import type { Prompter } from './ui';

const BACK = '..';
const QUIT = 'quit';

/** Thrown when the user quits from the main screen */
export class Quit extends Cancelled {
  constructor() {
    super('Bye');
    this.name = 'Quit';
  }
}

const badge = (danger: Danger): string => {
  switch (danger) {
    case 'read':
      return '';
    case 'mutate':
      return theme.warn(' ~');
    case 'destructive':
      return theme.danger(' !');
    case 'spends-money':
      return theme.danger(' $');
  }
};

/**
 * While a menu select is open, `q` and the left arrow act as escape. Only
 * here: clack's global aliases would also fire inside text prompts.
 */
async function withMenuKeys<T>(work: () => Promise<T>): Promise<T> {
  const stdin = process.stdin;
  const translate = (
    _chunk: string | undefined,
    key: { name?: string; ctrl?: boolean } | undefined
  ) => {
    if ((key?.name === 'q' && !key.ctrl) || key?.name === 'left') {
      stdin.emit('keypress', '', { name: 'escape', sequence: '' });
    }
  };
  stdin.on('keypress', translate);
  try {
    return await work();
  } finally {
    stdin.off('keypress', translate);
  }
}

const cancelled = (error: unknown): boolean => error instanceof Cancelled;

/**
 * Two-level menu: a group, then one of its commands. Top-level commands sit
 * beside the groups. `‹ back`, `q` or the left arrow step back; on the main
 * screen they quit.
 */
export async function pickFromMenu(
  ui: Prompter,
  groups: Group[],
  entries: Entry[],
  initial?: string
): Promise<Entry> {
  const top = entries.filter((e) => e.path.length === 1);
  let groupInitial = initial;

  for (;;) {
    const choices: Choice<string>[] = [
      ...groups
        .filter((g) =>
          entries.some((e) => e.path[0] === g.name && e.path.length > 1)
        )
        .map((g) => ({ value: g.name, label: g.name, hint: g.summary })),
      ...top.map((e) => ({
        value: e.path[0] ?? '',
        label: `${e.path[0]}${badge(e.danger)}`,
        hint: e.summary
      })),
      { value: QUIT, label: theme.muted('quit') }
    ];
    let picked: string;
    try {
      picked = await withMenuKeys(() =>
        ui.select({
          message: 'What do you want to do?',
          choices,
          initial: groupInitial
        })
      );
    } catch (error) {
      if (cancelled(error)) throw new Quit();
      throw error;
    }
    if (picked === QUIT) throw new Quit();
    const direct = top.find((e) => e.path[0] === picked);
    if (direct) return direct;

    const own = entries.filter(
      (e) => e.path[0] === picked && e.path.length > 1
    );
    let command: string;
    try {
      command = await withMenuKeys(() =>
        ui.select({
          message: `${picked} ${symbols.arrow}`,
          choices: [
            ...own.map((e) => ({
              value: e.path.slice(1).join(' '),
              label: `${e.path.slice(1).join(' ')}${badge(e.danger)}`,
              hint: e.summary
            })),
            { value: BACK, label: theme.muted('‹ back') }
          ]
        })
      );
    } catch (error) {
      if (!cancelled(error)) throw error;
      command = BACK;
    }
    if (command === BACK) {
      groupInitial = picked;
      continue;
    }
    const entry = own.find((e) => e.path.slice(1).join(' ') === command);
    if (!entry) throw new Cancelled();
    return entry;
  }
}

/** After a command: back to the menu, or out. Cancel and `q` quit. */
export async function afterCommand(ui: Prompter): Promise<'menu' | 'quit'> {
  try {
    const next = await withMenuKeys(() =>
      ui.select({
        message: 'What next?',
        choices: [
          { value: 'menu', label: '‹ back to the menu' },
          { value: 'quit', label: theme.muted('quit') }
        ]
      })
    );
    return next as 'menu' | 'quit';
  } catch (error) {
    if (cancelled(error)) return 'quit';
    throw error;
  }
}

/** Legend for the badges and keys the menu uses */
export const MENU_LEGEND = `${theme.warn('~')} changes things  ${theme.danger('!')} destructive  ${theme.danger('$')} spends money   ${theme.muted('↑↓ move · ⏎ pick · ‹ q back · q on this screen quits')}`;
