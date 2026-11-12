// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { issue } from '../view/fixtures';

import { Item, LoadMeter, PvMore, ReasonChip, Table } from './items';

describe('Item', () => {
  it('links the ticket and shows its priority and status', () => {
    const { container } = render(
      <ul>
        <Item
          details={new Map()}
          i={issue('COD-1', { priority: { value: 2 } })}
          state="ready"
          rank={3}
        />
      </ul>
    );
    expect(container.querySelector('li')?.className).toBe('item ready');
    expect(container.querySelector('.rank')?.textContent).toBe('3');
    const a = container.querySelector('a.title');
    expect(a?.getAttribute('href')).toBe(
      'https://linear.app/codeware/issue/COD-1'
    );
    expect(a?.textContent).toBe('COD-1Title of COD-1');
    expect(container.querySelector('.prio')?.textContent).toBe('▲▲ High');
    expect(container.querySelector('.prio')?.getAttribute('title')).toBe(
      'High'
    );
  });

  it('shows plan progress, and the note ahead of the next step', () => {
    const details = new Map([
      [
        'COD-1',
        {
          steps: 4,
          done: 1,
          next: 'then COD-2',
          idea: null,
          blockedBy: [],
          pr: null,
          prAt: null
        }
      ]
    ]);
    const plain = render(
      <ul>
        <Item details={details} i={issue('COD-1')} showNext />
      </ul>
    ).container;
    expect(plain.querySelector('.bar i')?.getAttribute('style')).toContain(
      '25%'
    );
    expect(plain.textContent).toContain('1/4 steps');
    expect(plain.querySelector('.next a.id')?.textContent).toBe('COD-2');
    const noted = render(
      <ul>
        <Item details={details} i={issue('COD-1')} showNext note="why" />
      </ul>
    ).container;
    expect(noted.querySelector('.next')).toBeNull();
    expect(noted.querySelector('.meta:last-child')?.textContent).toBe('why');
  });
});

describe('ReasonChip', () => {
  it('names the reason and tints it, and shows an unlisted one as it is', () => {
    const a = render(<ReasonChip reason="take over" />).container;
    expect(a.querySelector('.chip.takeover')?.textContent).toBe('take over');
    const b = render(<ReasonChip reason="odd" />).container;
    expect(b.querySelector('.chip.resume')?.textContent).toBe('odd');
  });
});

describe('LoadMeter', () => {
  const colour = (used: number) =>
    render(
      <LoadMeter m={{ limit: { used, max: 5 } }} />
    ).container.querySelector('i')?.style;

  it('goes green, then amber one below the limit, then red', () => {
    expect(colour(2)?.background).toContain('--ok');
    expect(colour(4)?.background).toContain('--wait');
    expect(colour(5)?.background).toContain('--block');
    expect(colour(5)?.width).toBe('100%');
  });
});

describe('PvMore and Table', () => {
  it('says how many more, or nothing when all fit', () => {
    expect(render(<PvMore n={3} />).container.textContent).toBe('+ 3 more');
    expect(render(<PvMore n={0} />).container.innerHTML).toBe('');
  });

  it('lays out a head and its rows', () => {
    const { container } = render(
      <Table head={['A', 'B']} rows={[['1', <b key="b">2</b>]]} />
    );
    expect(
      [...container.querySelectorAll('th')].map((x) => x.textContent)
    ).toEqual(['A', 'B']);
    expect(container.querySelector('td b')?.textContent).toBe('2');
  });
});
