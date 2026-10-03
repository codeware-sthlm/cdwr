import { describe, expect, it } from 'vitest';

import {
  type MenuState,
  boundCommands,
  buildMenus,
  shortcutLabel
} from './menu';

const state = (overrides: Partial<MenuState> = {}): MenuState => ({
  busy: null,
  readOnly: false,
  canSync: true,
  hasPanel: true,
  panelOpen: true,
  panelTitle: 'Inputs',
  fullscreen: false,
  ...overrides
});

const entries = (menuState: MenuState) =>
  Object.fromEntries(
    buildMenus(menuState).flatMap(({ entries: list }) =>
      list.map((entry) => [entry.id, entry])
    )
  );

describe('buildMenus', () => {
  it('lays out Insert, Edit, Build and View', () => {
    expect(
      buildMenus(state()).map(({ label, entries: list }) => [
        label,
        list.map(({ label: item }) => item)
      ])
    ).toEqual([
      ['Insert', ['Import']],
      ['Edit', ['Format']],
      ['Build', ['Sync inputs', 'Check']],
      ['View', ['Hide inputs panel', 'Full screen']]
    ]);
  });

  it('names the panel toggle after the panel', () => {
    expect(entries(state({ panelOpen: false })).togglePanel?.label).toBe(
      'Show inputs panel'
    );
    expect(entries(state({ panelTitle: 'Props' })).togglePanel?.label).toBe(
      'Hide props panel'
    );
  });

  it('flips the full screen label while it is on', () => {
    expect(entries(state()).fullscreen?.label).toBe('Full screen');
    expect(entries(state({ fullscreen: true })).fullscreen?.label).toBe(
      'Exit full screen'
    );
  });

  it('keeps full screen available when read-only or busy', () => {
    expect(
      entries(state({ readOnly: true, busy: 'check', hasPanel: false }))
        .fullscreen?.disabled
    ).toBe(false);
  });

  it('enables everything when idle', () => {
    expect(
      Object.values(entries(state())).every(({ disabled }) => !disabled)
    ).toBe(true);
  });

  it('disables the commands that change things when read-only', () => {
    const list = entries(state({ readOnly: true }));
    expect(list.format?.disabled).toBe(true);
    expect(list.import?.disabled).toBe(true);
    expect(list.sync?.disabled).toBe(true);
    expect(list.check?.disabled).toBe(false);
    expect(list.togglePanel?.disabled).toBe(false);
  });

  it('holds the busy commands while one runs', () => {
    const list = entries(state({ busy: 'check' }));
    expect(list.check).toMatchObject({ disabled: true, label: 'Checking…' });
    expect(list.format?.disabled).toBe(true);
    expect(list.sync?.disabled).toBe(true);
    expect(list.import?.disabled).toBe(false);
  });

  it('disables sync without a handler and the toggle without a panel', () => {
    const list = entries(state({ canSync: false, hasPanel: false }));
    expect(list.sync?.disabled).toBe(true);
    expect(list.togglePanel?.disabled).toBe(true);
  });
});

describe('shortcuts', () => {
  it('labels for both platforms', () => {
    const format = { key: 'F', shift: true, alt: true } as const;
    const check = { key: 'Enter', mod: true } as const;
    expect(shortcutLabel(format, false)).toBe('Alt+Shift+F');
    expect(shortcutLabel(format, true)).toBe('⌥⇧F');
    expect(shortcutLabel(check, false)).toBe('Ctrl+Enter');
    expect(shortcutLabel(check, true)).toBe('⌘↵');
  });

  it('binds format and check, which the menu shows', () => {
    expect(boundCommands().map(({ id }) => id)).toEqual(['format', 'check']);
    expect(entries(state()).format?.shortcut).not.toBeNull();
    expect(entries(state()).import?.shortcut).toBeNull();
  });
});
