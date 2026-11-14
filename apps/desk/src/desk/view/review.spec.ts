import { describe, expect, it } from 'vitest';

import { reviewRecord } from './fixtures';
import { findingChip, findingsByTicket, openFindings } from './review';

const dismissal = (finding_id: string) => ({
  finding_id,
  at: '2026-10-29T11:00:00Z',
  actor: 'desk',
  note: null
});

describe('openFindings', () => {
  it('has none without a review', () => {
    expect(openFindings(null, [])).toEqual([]);
  });

  it('drops the findings a dismissal names', () => {
    const review = reviewRecord();
    expect(
      openFindings(review, [dismissal('stale-pr:COD-2:0a1b2c3d')]).map(
        (f) => f.ticket
      )
    ).toEqual(['COD-3']);
  });

  it('keeps every finding before the dismissals have loaded', () => {
    expect(openFindings(reviewRecord(), null)).toHaveLength(2);
  });

  it('puts the blocking ones first and keeps the review order otherwise', () => {
    const [blocks, note] = reviewRecord().findings;
    const review = reviewRecord({ findings: [note, blocks] });
    expect(openFindings(review, []).map((f) => f.severity)).toEqual([
      'blocks',
      'note'
    ]);
  });
});

describe('findingsByTicket', () => {
  it('joins the open findings to their ticket', () => {
    const joined = findingsByTicket(reviewRecord(), [
      dismissal('thin-plan:COD-3:1b2c3d4e')
    ]);
    expect([...joined.keys()]).toEqual(['COD-2']);
    expect(joined.get('COD-2')?.[0].fix).toBe('Rebase it');
  });

  it('gathers several findings of one ticket', () => {
    const [first] = reviewRecord().findings;
    const review = reviewRecord({
      findings: [
        first,
        { ...first, id: 'other:COD-2:2c3d4e5f', severity: 'note' }
      ]
    });
    expect(findingsByTicket(review, []).get('COD-2')).toHaveLength(2);
  });
});

describe('findingChip', () => {
  it('colours a blocking finding as a warning and a note as muted', () => {
    expect(findingChip({ kind: 'stale PR', severity: 'blocks' })).toEqual({
      kind: 'ai-blocks',
      text: 'AI · stale PR'
    });
    expect(findingChip({ kind: 'thin plan', severity: 'note' })).toEqual({
      kind: 'ai-note',
      text: 'AI · thin plan'
    });
  });
});
