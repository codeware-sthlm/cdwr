// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { model } from '../model';
import { NOW, filled } from '../view/fixtures';

import { IdLink, Inline, LinkIds, PrLink, PrPill, Prn } from './links';

describe('IdLink', () => {
  it('links a well-formed ticket id to Linear', () => {
    const { container } = render(<IdLink id="COD-12" />);
    const a = container.querySelector('a.id');
    expect(a?.getAttribute('href')).toBe(
      'https://linear.app/codeware/issue/COD-12'
    );
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a?.textContent).toBe('COD-12');
  });

  it('shows anything else as a plain id, a dash when empty', () => {
    const odd = render(<IdLink id="COD-<5>" />);
    expect(odd.container.querySelector('a')).toBeNull();
    expect(odd.container.querySelector('span.id')?.textContent).toBe('COD-<5>');
    const none = render(<IdLink />);
    expect(none.container.querySelector('span.id')?.textContent).toBe('—');
  });
});

describe('Prn', () => {
  it('links the number, tinted by its tone', () => {
    const { container } = render(<Prn n={31} tone="ok" />);
    const a = container.querySelector('a');
    expect(a?.className).toBe('prn ok');
    expect(a?.getAttribute('href')).toBe(
      'https://github.com/codeware-sthlm/cdwr/pull/31'
    );
    expect(a?.getAttribute('title')).toBe('Pull request 31');
    expect(a?.textContent).toBe('#31');
  });

  it('leaves the tone out when neutral or missing, and renders nothing without a number', () => {
    const neutral = render(<Prn n="7" tone="neutral" />);
    expect(neutral.container.querySelector('a')?.className).toBe('prn');
    const bare = render(<Prn n="7" />);
    expect(bare.container.querySelector('a')?.className).toBe('prn');
    const none = render(<Prn n={null} />);
    expect(none.container.innerHTML).toBe('');
  });
});

describe('PrLink', () => {
  it('links the PR as a plain id, and renders nothing without one', () => {
    const { container } = render(<PrLink n={5} />);
    const a = container.querySelector('a.id');
    expect(a?.getAttribute('href')).toBe(
      'https://github.com/codeware-sthlm/cdwr/pull/5'
    );
    expect(a?.textContent).toBe('#5');
    expect(render(<PrLink n={undefined} />).container.innerHTML).toBe('');
  });
});

describe('LinkIds', () => {
  it('links a ticket id inside text and leaves the rest alone', () => {
    const { container } = render(
      <LinkIds text="after COD-1 lands, SHA-256 and UTF-8 stay <b>" />
    );
    const links = container.querySelectorAll('a.id');
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe('COD-1');
    expect(container.textContent).toBe(
      'after COD-1 lands, SHA-256 and UTF-8 stay <b>'
    );
    expect(container.querySelector('b')).toBeNull();
  });

  it('links every ticket id, not only the first', () => {
    const { container } = render(<LinkIds text="After COD-2 · PR 5, COD-1" />);
    const links = [...container.querySelectorAll('a.id')];
    expect(links.map((a) => a.textContent)).toEqual(['COD-2', 'COD-1']);
  });
});

describe('Inline', () => {
  it('puts every backtick span in <code>, not only the first', () => {
    const { container } = render(<Inline text="`a` then `b`" />);
    const codes = [...container.querySelectorAll('code')];
    expect(codes.map((c) => c.textContent)).toEqual(['a', 'b']);
  });

  it('puts backtick spans in <code> and links ids inside and outside them', () => {
    const { container } = render(<Inline text="after COD-7 in `COD-8` now" />);
    const code = container.querySelector('code');
    expect(code?.textContent).toBe('COD-8');
    expect(code?.querySelector('a.id')?.textContent).toBe('COD-8');
    expect(container.querySelectorAll('a.id')).toHaveLength(2);
    expect(container.textContent).toBe('after COD-7 in COD-8 now');
  });

  it('names the links in the text, and leaves markup as text', () => {
    const { container } = render(
      <Inline text="see https://linear.app/codeware/issue/COD-3 <b>" />
    );
    expect(container.textContent).toBe('see COD-3 <b>');
    expect(container.querySelector('b')).toBeNull();
  });

  it('renders nothing for no text', () => {
    expect(render(<Inline text={null} />).container.innerHTML).toBe('');
  });
});

describe('PrPill', () => {
  const x = { ticket: 'COD-2', pr: 5 };

  it('says queued, without an age, before any event', () => {
    const state = filled();
    const { container } = render(
      <PrPill m={model(state, NOW)} details={state.details} x={x} now={NOW} />
    );
    expect(container.querySelector('.pill.neutral')?.textContent).toBe(
      'queued'
    );
    expect(container.querySelector('time')).toBeNull();
  });

  it('shows the live state and how long ago it landed', () => {
    const state = filled();
    state.data.githubEvents = [
      {
        pr: 5,
        subject: 'x',
        action: 'check_suite:success',
        updated_at: new Date('2026-10-29T11:56:00').toISOString()
      } as never
    ];
    const { container } = render(
      <PrPill m={model(state, NOW)} details={state.details} x={x} now={NOW} />
    );
    expect(container.querySelector('.pill.ok')?.textContent).toBe(
      'checks passed'
    );
    expect(container.querySelector('time')?.textContent).toBe('4 m ago');
  });
});
