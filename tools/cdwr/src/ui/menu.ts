import type { Danger } from '../cli/command';
import { Cancelled } from '../cli/errors';
import type { Choice } from '../cli/inputs';
import type { Entry, Group } from '../cli/registry';

import { symbols, theme } from './theme';
import type { Prompter } from './ui';

const BACK = '..';

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
 * Two-level menu: a group, then one of its commands. Top-level commands sit
 * beside the groups. Returns the picked entry; `..` steps back.
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
      }))
    ];
    const picked = await ui.select({
      message: 'What do you want to do?',
      choices,
      initial: groupInitial
    });
    const direct = top.find((e) => e.path[0] === picked);
    if (direct) return direct;

    const own = entries.filter(
      (e) => e.path[0] === picked && e.path.length > 1
    );
    const command = await ui.select({
      message: `${picked} ${symbols.arrow}`,
      choices: [
        ...own.map((e) => ({
          value: e.path.slice(1).join(' '),
          label: `${e.path.slice(1).join(' ')}${badge(e.danger)}`,
          hint: e.summary
        })),
        { value: BACK, label: theme.muted('back') }
      ]
    });
    if (command === BACK) {
      groupInitial = picked;
      continue;
    }
    const entry = own.find((e) => e.path.slice(1).join(' ') === command);
    if (!entry) throw new Cancelled();
    return entry;
  }
}

/** Legend for the badges the menu shows */
export const MENU_LEGEND = `${theme.warn('~')} changes things  ${theme.danger('!')} destructive  ${theme.danger('$')} spends money`;
