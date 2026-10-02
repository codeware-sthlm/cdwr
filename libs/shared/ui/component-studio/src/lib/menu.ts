import type { BusyTask } from './last-action';

export type CommandId = 'format' | 'import' | 'check' | 'sync' | 'togglePanel';

export type MenuId = 'edit' | 'insert' | 'build' | 'view';

export type ShortcutKey = 'F' | 'Enter';

/** `mod` is Ctrl, or Cmd on a Mac */
export type Shortcut = {
  key: ShortcutKey;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
};

/** What the menus and the editor's key bindings both read */
export const SHORTCUTS: Partial<Record<CommandId, Shortcut>> = {
  format: { key: 'F', shift: true, alt: true },
  check: { key: 'Enter', mod: true }
};

export type MenuState = {
  busy: BusyTask | null;
  readOnly: boolean;
  canSync: boolean;
  hasPanel: boolean;
  panelOpen: boolean;
  panelTitle: string;
};

type CommandSpec = {
  label: (state: MenuState) => string;
  disabled: (state: MenuState) => boolean;
};

/** One entry per command; a command not listed here does not compile */
const COMMANDS = {
  format: {
    label: () => 'Format',
    disabled: ({ busy, readOnly }) => readOnly || busy !== null
  },
  import: {
    label: () => 'Import',
    disabled: ({ readOnly }) => readOnly
  },
  check: {
    label: ({ busy }) => (busy === 'check' ? 'Checking…' : 'Check'),
    disabled: ({ busy }) => busy !== null
  },
  sync: {
    label: ({ busy }) => (busy === 'sync' ? 'Syncing inputs…' : 'Sync inputs'),
    disabled: ({ busy, readOnly, canSync }) =>
      readOnly || !canSync || busy !== null
  },
  togglePanel: {
    label: ({ panelOpen, panelTitle }) =>
      `${panelOpen ? 'Hide' : 'Show'} ${panelTitle.toLowerCase()} panel`,
    disabled: ({ hasPanel }) => !hasPanel
  }
} as const satisfies Record<CommandId, CommandSpec>;

/** The toolbar's groups, left to right; a new item is one more id in a list */
const MENUS = [
  { id: 'insert', label: 'Insert', commands: ['import'] },
  { id: 'edit', label: 'Edit', commands: ['format'] },
  { id: 'build', label: 'Build', commands: ['sync', 'check'] },
  { id: 'view', label: 'View', commands: ['togglePanel'] }
] as const satisfies ReadonlyArray<{
  id: MenuId;
  label: string;
  commands: readonly CommandId[];
}>;

export type MenuEntry = {
  id: CommandId;
  label: string;
  disabled: boolean;
  shortcut: Shortcut | null;
};

export type MenuModel = { id: MenuId; label: string; entries: MenuEntry[] };

export const buildMenus = (state: MenuState): MenuModel[] =>
  MENUS.map(({ id, label, commands }) => ({
    id,
    label,
    entries: commands.map((command) => ({
      id: command,
      label: COMMANDS[command].label(state),
      disabled: COMMANDS[command].disabled(state),
      shortcut: SHORTCUTS[command] ?? null
    }))
  }));

const KEY_LABELS = { F: 'F', Enter: 'Enter' } as const satisfies Record<
  ShortcutKey,
  string
>;

const MAC_KEY_LABELS = { F: 'F', Enter: '↵' } as const satisfies Record<
  ShortcutKey,
  string
>;

/** `⇧⌥F` on a Mac, `Shift+Alt+F` elsewhere */
export const shortcutLabel = (shortcut: Shortcut, mac: boolean): string => {
  if (mac) {
    return [
      shortcut.alt ? '⌥' : '',
      shortcut.shift ? '⇧' : '',
      shortcut.mod ? '⌘' : '',
      MAC_KEY_LABELS[shortcut.key]
    ].join('');
  }
  return [
    shortcut.mod ? 'Ctrl' : null,
    shortcut.alt ? 'Alt' : null,
    shortcut.shift ? 'Shift' : null,
    KEY_LABELS[shortcut.key]
  ]
    .filter((part) => part !== null)
    .join('+');
};

/** The commands that have a key binding, for the editor to register */
export const boundCommands = (): Array<{ id: CommandId; shortcut: Shortcut }> =>
  MENUS.flatMap(({ commands }) => commands).flatMap((id) => {
    const shortcut = SHORTCUTS[id];
    return shortcut ? [{ id, shortcut }] : [];
  });
