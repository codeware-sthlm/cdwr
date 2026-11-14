import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { SEARCH_ID } from '../constants';
import type { Model } from '../model';
import type { DeskState } from '../state';
import { canonicalId } from '../view/ids';
import { type SearchPlace, searchTickets } from '../view/search';

import { Icon } from './icon';
import { Chip } from './items';
import { ID } from './items-ui';

// The header search: finds a ticket among everything the desk holds and opens its sheet

type Option = {
  ticket: string;
  title: string;
  where: SearchPlace[];
  /** An id the desk may not hold: offered as "Open COD-n" */
  typed: boolean;
};

const FIELD =
  'min-h-[var(--tap)] w-[220px] rounded-[var(--r-row)] border border-[color:var(--line-strong)] bg-[color:var(--control)] px-3 text-[12px] text-[color:var(--fg)] placeholder:text-[color:var(--muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)] max-[600px]:w-full';
const LIST =
  'absolute top-full right-0 z-40 mt-1 grid max-h-[60vh] w-[min(440px,90vw)] gap-0.5 overflow-y-auto rounded-[var(--r-tile)] border border-[color:var(--line-strong)] bg-[color:var(--surface)] p-1.5 text-[0.85rem] text-[color:var(--fg)] shadow-lg';
const OPTION =
  'flex min-w-0 cursor-pointer flex-wrap items-baseline gap-x-2 gap-y-1 rounded-[var(--r-row)] px-2.5 py-1.5 aria-selected:bg-[color:var(--control)]';

/** The options a query offers: its hits, else the id it names, else none */
const optionsOf = (m: Model, state: DeskState, query: string): Option[] => {
  const hits = searchTickets(m, state, query);
  if (hits.length) return hits.map((h) => ({ ...h, typed: false }));
  const id = canonicalId(query);
  return id ? [{ ticket: id, title: '', where: [], typed: true }] : [];
};

/** Whether typing goes to the target already, so a shortcut must leave it alone */
const typingIn = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest(
    'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
  ) !== null;

/** The header's ticket search; `/` and Ctrl or ⌘ K focus it, and on the phone it opens from an icon */
export const Search = ({
  m,
  state,
  onOpen
}: {
  m: Model;
  state: DeskState;
  onOpen: (id: string) => void;
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // The phone's field is an icon until it is pressed
  const [wide, setWide] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (wide) input.current?.focus();
  }, [wide]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey;
      const k = e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey);
      if ((!slash && !k) || e.defaultPrevented) return;
      if (typingIn(e.target) || document.querySelector('[role="dialog"]'))
        return;
      e.preventDefault();
      setWide(true);
      input.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const shown = open && query.trim() !== '';
  const options = shown ? optionsOf(m, state, query) : [];
  const at = Math.min(active, options.length - 1);
  const optionId = (n: number) => `${listId}-${n}`;

  const choose = (ticket: string) => {
    onOpen(ticket);
    setQuery('');
    setOpen(false);
    setActive(0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown) setOpen(query.trim() !== '');
      else if (options.length)
        setActive(
          (at + (e.key === 'ArrowDown' ? 1 : -1) + options.length) %
            options.length
        );
    } else if (e.key === 'Enter') {
      const o = options[at];
      if (!o) return;
      e.preventDefault();
      choose(o.ticket);
    } else if (e.key === 'Escape') {
      // Handled here: the view's Escape handler must not also leave the view
      e.preventDefault();
      e.stopPropagation();
      if (open || query) {
        setQuery('');
        setOpen(false);
        setActive(0);
      } else input.current?.blur();
    }
  };

  return (
    <div className="relative flex items-center">
      {wide ? null : (
        <button
          type="button"
          className="tool hidden min-h-[var(--tap)] min-w-[var(--tap)] items-center justify-center p-0 max-[600px]:inline-flex"
          aria-label="Search tickets"
          onClick={() => setWide(true)}
        >
          <Icon name="search" className="size-4" />
        </button>
      )}
      <input
        ref={input}
        id={SEARCH_ID}
        type="search"
        role="combobox"
        className={wide ? FIELD : `${FIELD} max-[600px]:hidden`}
        placeholder="Search tickets  /"
        aria-label="Search tickets"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={options.length ? optionId(at) : undefined}
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(query.trim() !== '')}
        onBlur={() => {
          setOpen(false);
          if (!query) setWide(false);
        }}
        onKeyDown={onKeyDown}
      />
      {shown ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Tickets found"
          className={LIST}
        >
          {options.length ? (
            options.map((o, n) => (
              <li
                key={o.ticket}
                id={optionId(n)}
                role="option"
                aria-selected={n === at}
                className={OPTION}
                // The field keeps focus, so the click lands before a blur closes the list
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o.ticket)}
              >
                {o.typed ? (
                  `Open ${o.ticket}`
                ) : (
                  <>
                    <span className={ID}>{o.ticket}</span>
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                      {o.title}
                    </span>
                    {o.where.map((w) => (
                      <Chip key={w} kind="held">
                        {w}
                      </Chip>
                    ))}
                  </>
                )}
              </li>
            ))
          ) : (
            <li
              role="presentation"
              className="px-2.5 py-1.5 text-[color:var(--muted)]"
            >
              No ticket matches
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
};
