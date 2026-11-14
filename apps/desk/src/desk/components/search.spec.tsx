// @vitest-environment jsdom
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { model } from '../model';
import { NOW, filled } from '../view/fixtures';

import { Search } from './search';

afterEach(cleanup);

/** The search over the filled desk, next to a field of its own; `onOpen` records what it opens */
const mount = (onOpen = vi.fn()) => {
  const state = filled();
  render(
    <>
      <Search m={model(state, NOW)} state={state} onOpen={onOpen} />
      <input aria-label="other" />
    </>
  );
  return {
    onOpen,
    field: screen.getByRole<HTMLInputElement>('combobox'),
    other: screen.getByLabelText<HTMLInputElement>('other')
  };
};

const type = (field: HTMLElement, value: string): void => {
  fireEvent.change(field, { target: { value } });
};

const key = (target: Element, init: KeyboardEventInit): void => {
  fireEvent.keyDown(target, init);
};

const options = (): string[] =>
  screen.queryAllByRole('option').map((o) => o.textContent ?? '');

describe('Search', () => {
  it('is a labelled combobox that controls a listbox', () => {
    const { field } = mount();
    expect(field.type).toBe('search');
    expect(field.getAttribute('aria-label')).toBe('Search tickets');
    expect(field.getAttribute('aria-autocomplete')).toBe('list');
    expect(field.getAttribute('aria-expanded')).toBe('false');
    type(field, '3');
    const list = screen.getByRole('listbox');
    expect(field.getAttribute('aria-expanded')).toBe('true');
    expect(field.getAttribute('aria-controls')).toBe(list.id);
    expect(field.getAttribute('aria-activedescendant')).toBe(
      screen.getAllByRole('option')[0].id
    );
  });

  it('lists an exact id before the ids that start with the query, with where each shows up', () => {
    const { field } = mount();
    type(field, '3');
    expect(options()).toEqual([
      'COD-3Title of COD-3openreview',
      'COD-30Title of COD-30closed'
    ]);
  });

  it('lists the ids with a prefix after the exact id, the higher number first', () => {
    const { field } = mount();
    type(field, 'cod-5');
    const [exact, ...prefixed] = options();
    // COD-5 shows up only among the hand-offs, so it has no title
    expect(exact).toBe('COD-5hand-offs');
    expect(prefixed.map((o) => o.slice(0, 6))).toEqual(['COD-51', 'COD-50']);
  });

  it('lists the titles that hold every word of the query', () => {
    const { field } = mount();
    type(field, 'title of cod-5');
    expect(options().map((o) => o.slice(0, 6))).toEqual(['COD-51', 'COD-50']);
  });

  it('moves the active option with the arrow keys and opens it on Enter', () => {
    const { field, onOpen } = mount();
    type(field, '3');
    key(field, { key: 'ArrowDown' });
    const [first, second] = screen.getAllByRole('option');
    expect(first.getAttribute('aria-selected')).toBe('false');
    expect(second.getAttribute('aria-selected')).toBe('true');
    key(field, { key: 'ArrowDown' });
    expect(first.getAttribute('aria-selected')).toBe('true');
    key(field, { key: 'ArrowUp' });
    expect(second.getAttribute('aria-selected')).toBe('true');
    key(field, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledWith('COD-30');
    expect(field.value).toBe('');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens the first option on Enter without a move, and one that was clicked', () => {
    const { field, onOpen } = mount();
    type(field, '3');
    key(field, { key: 'Enter' });
    expect(onOpen).toHaveBeenLastCalledWith('COD-3');
    type(field, '3');
    fireEvent.click(screen.getAllByRole('option')[1]);
    expect(onOpen).toHaveBeenLastCalledWith('COD-30');
    expect(field.value).toBe('');
  });

  it('keeps focus in the field when an option is pressed', () => {
    const { field } = mount();
    type(field, '3');
    const down = createEvent.mouseDown(screen.getAllByRole('option')[0]);
    fireEvent(screen.getAllByRole('option')[0], down);
    expect(down.defaultPrevented).toBe(true);
  });

  it('offers to open an id the desk does not hold', () => {
    const { field, onOpen } = mount();
    type(field, '999');
    expect(options()).toEqual(['Open COD-999']);
    key(field, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledWith('COD-999');
  });

  it('says no ticket matches, and opens nothing on Enter', () => {
    const { field, onOpen } = mount();
    type(field, 'zzzz');
    expect(screen.getByText('No ticket matches')).not.toBeNull();
    expect(options()).toEqual([]);
    key(field, { key: 'Enter' });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('closes the list when the field loses focus', () => {
    const { field } = mount();
    act(() => field.focus());
    type(field, '3');
    expect(screen.queryByRole('listbox')).not.toBeNull();
    act(() => field.blur());
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(field.value).toBe('3');
  });

  it('clears on Escape and marks it handled, then blurs on a second one', () => {
    const { field } = mount();
    act(() => field.focus());
    type(field, '3');
    const first = createEvent.keyDown(field, { key: 'Escape' });
    fireEvent(field, first);
    expect(first.defaultPrevented).toBe(true);
    expect(field.value).toBe('');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(field);
    const second = createEvent.keyDown(field, { key: 'Escape' });
    fireEvent(field, second);
    expect(second.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(field);
  });

  it('is not reached by the document on Escape', () => {
    const { field } = mount();
    const onDocument = vi.fn();
    document.addEventListener('keydown', onDocument);
    key(field, { key: 'Escape' });
    document.removeEventListener('keydown', onDocument);
    expect(onDocument).not.toHaveBeenCalled();
  });

  it.each([
    ['/', { key: '/' }],
    ['Ctrl+K', { key: 'k', ctrlKey: true }],
    ['Cmd+K', { key: 'K', metaKey: true }]
  ])('focuses the field on %s', (_name, init) => {
    const { field } = mount();
    const ev = createEvent.keyDown(document.body, init);
    fireEvent(document.body, ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(field);
  });

  it('leaves the shortcuts to another field being typed in', () => {
    const { field, other } = mount();
    act(() => other.focus());
    key(other, { key: '/' });
    key(other, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(other);
    expect(document.activeElement).not.toBe(field);
  });

  it('leaves the shortcuts alone while a sheet is open', () => {
    const { field } = mount();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    key(document.body, { key: '/' });
    dialog.remove();
    expect(document.activeElement).not.toBe(field);
  });

  it('shows the field from an icon on the phone, and hides it again on blur when empty', () => {
    const { field } = mount();
    const icon = screen.getByRole('button', { name: 'Search tickets' });
    fireEvent.click(icon);
    expect(document.activeElement).toBe(field);
    expect(screen.queryByRole('button', { name: 'Search tickets' })).toBeNull();
    act(() => field.blur());
    expect(
      screen.queryByRole('button', { name: 'Search tickets' })
    ).not.toBeNull();
  });
});
