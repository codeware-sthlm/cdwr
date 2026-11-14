import type { ReviewFinding } from '@codeware/shared/util/agent-review';

import type { DismissalRow } from '../../supabase';
import type { ReviewRecord } from '../types';

// The review's findings as the tree rows and the Ticket sheet show them: the ones nobody dismissed, by ticket

/** The longest note a dismissal takes, as the desk-command function limits it */
export const NOTE_MAX = 200;

/** The review's findings that no dismissal names, blocking ones first, else in the review's order */
export const openFindings = (
  review: ReviewRecord | null,
  dismissals: readonly DismissalRow[] | null
): ReviewFinding[] => {
  const dismissed = new Set((dismissals ?? []).map((d) => d.finding_id));
  return (review?.findings ?? [])
    .filter((f) => !dismissed.has(f.id))
    .map((f, n) => ({ f, n }))
    .sort(
      (a, b) =>
        Number(a.f.severity !== 'blocks') - Number(b.f.severity !== 'blocks') ||
        a.n - b.n
    )
    .map(({ f }) => f);
};

/** The open findings by the ticket they are about */
export const findingsByTicket = (
  review: ReviewRecord | null,
  dismissals: readonly DismissalRow[] | null
): Map<string, ReviewFinding[]> => {
  const byTicket = new Map<string, ReviewFinding[]>();
  for (const f of openFindings(review, dismissals))
    byTicket.set(f.ticket, [...(byTicket.get(f.ticket) ?? []), f]);
  return byTicket;
};

/** The chip of a finding: `blocks` takes the warn colours, `note` the muted ones */
export const findingChip = (
  f: Pick<ReviewFinding, 'kind' | 'severity'>
): { kind: 'ai-blocks' | 'ai-note'; text: string } => ({
  kind: f.severity === 'blocks' ? 'ai-blocks' : 'ai-note',
  text: `AI · ${f.kind}`
});
