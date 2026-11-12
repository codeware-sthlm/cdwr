import { shortAge } from '../format';
import type { PrStateName } from '../live';
import { type Model, prOf } from '../model';
import type { Detail } from '../state';
import type { PrRef } from '../types';

// How a queued ticket's pull request reads: its live state, tone and pill text

export type PrTone = 'wait' | 'ok' | 'bad' | 'neutral';

/** How a PR's state reads: `wait` when it waits on you, `ok` when it is on its way, `bad` when checks failed */
export const prTone = (state: PrStateName | null): PrTone =>
  state === 'Copilot reviewed' ||
  state === 'reviewed' ||
  state === 'review requested'
    ? 'wait'
    : state === 'checks passed' ||
        state === 'in merge queue' ||
        state === 'merged'
      ? 'ok'
      : state === 'checks failed'
        ? 'bad'
        : 'neutral';

/** The pill text of a PR state; Copilot's review says whose turn it is */
export const prStateText = (state: PrStateName): string =>
  state === 'Copilot reviewed' ? 'Copilot reviewed — your turn' : state;

/** The PR the queue view names for a ticket, among its PRs and parked waits; null when it names none */
export const queuePr = (
  m: Pick<Model, 'prs' | 'parked'>,
  id: string
): PrRef | null =>
  [...m.prs, ...m.parked].find((x) => x.ticket === id && x.pr)?.pr ?? null;

/** A queued PR's number and the github_events PR behind it, when one has landed */
export const livePr = (
  m: Pick<Model, 'agentPrs'>,
  details: ReadonlyMap<string, Detail>,
  x: { ticket: string; pr?: PrRef | null }
): { n: PrRef | null; live: Model['agentPrs'][number] | undefined } => {
  const n = prOf(details, x.ticket, x.pr);
  return {
    n,
    live: n === null ? undefined : m.agentPrs.find((p) => p.pr === Number(n))
  };
};

/** The PR pill as data: its tone and text, and how long ago a github event landed, null without one */
export const prPillData = (
  m: Pick<Model, 'agentPrs'>,
  details: ReadonlyMap<string, Detail>,
  x: { ticket: string; pr?: PrRef | null },
  now: Date
): { tone: PrTone; text: string; age: string | null } => {
  const { live } = livePr(m, details, x);
  return {
    tone: live ? prTone(live.state) : 'neutral',
    text: !live ? 'queued' : live.state ? prStateText(live.state) : live.action,
    age: live ? `${shortAge((now.getTime() - live.at) / 6e4)} ago` : null
  };
};
