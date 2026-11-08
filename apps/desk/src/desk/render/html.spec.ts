import { describe, expect, it } from 'vitest';

import {
  empty,
  idLink,
  isTicketId,
  linkIds,
  parkedText,
  prn,
  pvMore,
  reasonChip,
  sessionLabel,
  tLink
} from './html';

describe('html helpers', () => {
  it('escape what they interpolate', () => {
    const link = tLink({ id: 'COD-1', title: '<b>"x" & y', url: 'u"v' });
    expect(link).toContain('href="u&quot;v"');
    expect(link).toContain('&lt;b&gt;&quot;x&quot; &amp; y');
    expect(link).not.toContain('<b>');
    expect(idLink('A<B')).toContain('A&lt;B');
    expect(reasonChip('<x>')).toContain('&lt;x&gt;');
  });

  it('link a pull request, or give nothing without one', () => {
    expect(prn(12)).toContain(
      'href="https://github.com/codeware-sthlm/cdwr/pull/12"'
    );
    expect(prn(null)).toBe('');
    expect(prn(undefined)).toBe('');
  });

  it('show a reason the page does not list as it is', () => {
    expect(reasonChip('take over')).toBe(
      '<span class="chip takeover">take over</span>'
    );
    expect(reasonChip('conflicts with main')).toBe(
      '<span class="chip conflict">conflicts with main</span>'
    );
    expect(reasonChip('odd')).toBe('<span class="chip resume">odd</span>');
    expect(reasonChip(undefined)).toBe('<span class="chip resume"></span>');
  });

  it('label a session state, and pass one it does not know through', () => {
    expect(sessionLabel('waiting')).toBe('Session waits on you');
    expect(sessionLabel('odd')).toBe('odd');
  });

  it('say what a parked ticket waits on', () => {
    expect(parkedText({ ticket: 'A', wait: 'ci' })).toBe('waits on CI');
    expect(parkedText({ ticket: 'A', wait: 'ci', resolved: true })).toBe(
      'CI done, resumes next'
    );
    expect(parkedText({ ticket: 'A', wait: 'x<' })).toBe('waits on x&lt;');
  });

  it('link a ticket id to Linear, and show anything else as a plain id', () => {
    expect(idLink('COD-12')).toBe(
      '<a class="id" href="https://linear.app/codeware/issue/COD-12" target="_blank" rel="noopener">COD-12</a>'
    );
    expect(idLink('cod-12')).toBe('<span class="id">cod-12</span>');
    expect(idLink('')).toBe('<span class="id">—</span>');
    expect(isTicketId('COD-1')).toBe(true);
    expect(isTicketId('COD-1 x')).toBe(false);
  });

  it('link the ticket ids in text, but not in tags, inside a link, or another prefix', () => {
    const out = linkIds(
      'After COD-7 · PR 9, <code>COD-8</code>; UTF-8 <a href="x/COD-9">COD-9</a> then COD-10.'
    );
    expect(out).toBe(
      `After ${idLink('COD-7')} · PR 9, <code>${idLink('COD-8')}</code>; UTF-8 <a href="x/COD-9">COD-9</a> then ${idLink('COD-10')}.`
    );
    expect(linkIds('XCOD-1 COD-1x')).toBe('XCOD-1 COD-1x');
    expect(linkIds('')).toBe('');
  });

  it('count what a preview leaves out', () => {
    expect(pvMore(0)).toBe('');
    expect(pvMore(2)).toBe('<p class="pv-more">+ 2 more</p>');
    expect(empty('x')).toBe('<div class="empty">x</div>');
  });
});
