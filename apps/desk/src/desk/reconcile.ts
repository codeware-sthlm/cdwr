import type { Issue } from '../linear';

import { isClosed } from './constants';
import type { QueueView } from './types';

// The queue view is the scheduler's snapshot; the issue lists are live. An entry that a live change
// made after the snapshot contradicts is left out until the next view, so a ticket doesn't show in
// its old place and its new one. Unknown is no contradiction: an entry stays unless the live issue
// says otherwise.

export type LiveIssue = Pick<Issue, 'labels' | 'statusType' | 'updatedAt'>;

export type Live = {
  /** The live issue; undefined when no list holds it */
  issue: (id: string) => LiveIssue | undefined;
  /** The ticket's Next line; null without one, undefined until its details load */
  nextLine: (id: string) => string | null | undefined;
};

/** True when the live issue contradicts the entry */
type Rule = (i: LiveIssue, id: string, live: Live) => boolean;

/** Closed, or without any of the labels the entry needs */
const unless =
  (...labels: string[]): Rule =>
  (i) =>
    isClosed(i.statusType) || !labels.some((l) => i.labels.includes(l));

const notWorking = unless('agent:working');
const notReady = unless('agent:ready');
const notReview = unless('agent:review');
const notWorkingOrReview = unless('agent:working', 'agent:review');

/** A Next line that is still a wait marker; Linear keeps it in its code span */
const isWaiting = (line: string): boolean => /^`?\s*Waiting:/.test(line.trim());

const parked: Rule = (i, id, live) => {
  if (notWorkingOrReview(i, id, live)) return true;
  const line = live.nextLine(id);
  return typeof line === 'string' && !isWaiting(line);
};

const NEXT: ReadonlyMap<string, Rule> = new Map([
  ['resume', notWorking],
  ['take over', notWorking],
  ['parked wait resolved', parked],
  ['answered', unless('agent:needs-input')],
  ['review feedback', notReview],
  ['ready', notReady]
]);

/** The view without the `next`, `parked`, held and open-PR entries a later live change contradicts */
export const reconcileView = (view: QueueView, live: Live): QueueView => {
  const at = view.at ? Date.parse(view.at) : NaN;
  if (Number.isNaN(at)) return view;
  const stays = (id: string, rule: Rule | undefined): boolean => {
    const i = live.issue(id);
    // A live issue no newer than the view can't overrule it
    if (!i || !rule || !(Date.parse(i.updatedAt) > at)) return true;
    return !rule(i, id, live);
  };
  return {
    ...view,
    next: view.next.filter((x) =>
      stays(x.ticket, x.reason === undefined ? undefined : NEXT.get(x.reason))
    ),
    parked: view.parked.filter((p) => stays(p.ticket, parked)),
    held: {
      ...view.held,
      tickets: view.held.tickets.filter((id) => stays(id, notReady))
    },
    table: {
      ...view.table,
      // Hand-off entries are about closed tickets, and their items are already live
      after: view.table.after.filter(
        (x) => x.kind !== 'pr' || stays(x.ticket, notReview)
      )
    }
  };
};
