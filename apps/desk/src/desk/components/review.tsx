import type { ReviewFinding } from '@codeware/shared/util/agent-review';
import { type ReactNode, useState } from 'react';

import { seenAgo, usd } from '../format';
import type { ReviewRecord } from '../types';
import { NOTE_MAX, findingChip } from '../view/review';

import { WNOTE, WSNOOZE_CARD } from './before';
import { Chip, Empty } from './items';
import { GROUP, META } from './items-ui';
import { IdLink, Inline, TicketButton } from './links';

// The review the scheduler's review run wrote: on the tree page as a panel, and its findings as AI chips on the rows and in the Ticket sheet

const PANEL =
  'review-panel flex min-w-0 flex-col gap-3 rounded-[var(--r-card)] border border-[color:var(--line-strong)] bg-[color:var(--raised)] px-3.5 py-[13px]';
const ROW =
  'flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.88rem]';

/** The Review now button and the note a refusal left; nothing without a control token */
const ReviewNow = ({
  can,
  busy,
  note,
  onReview
}: Pick<PanelProps, 'can' | 'busy' | 'note' | 'onReview'>) =>
  can ? (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={WSNOOZE_CARD}
        data-review-now
        disabled={busy}
        onClick={onReview}
      >
        {busy ? 'Reviewing…' : 'Review now'}
      </button>
      {note ? <span className={WNOTE}>{note}</span> : null}
    </span>
  ) : null;

const Section = ({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) => (
  <div className={GROUP}>
    <h3>{title}</h3>
    {children}
  </div>
);

type PanelProps = {
  review: ReviewRecord | null;
  now: Date;
  /** Whether the desk holds a control token, which shows the button */
  can: boolean;
  /** The review request is in flight */
  busy: boolean;
  /** Why the last request did not go through */
  note: string | null;
  onReview: () => void;
  onTicket: (id: string) => void;
};

/** The newest review: the brief, what to do in order, stale tickets and suggestions, then when it ran and what it cost */
export const ReviewPanel = ({
  review,
  now,
  can,
  busy,
  note,
  onReview,
  onTicket
}: PanelProps) => {
  if (!review)
    return (
      <section className={PANEL} aria-label="Review">
        <Empty>
          <span className="flex flex-wrap items-center gap-3">
            <span>No review yet.</span>
            <ReviewNow can={can} busy={busy} note={note} onReview={onReview} />
          </span>
        </Empty>
      </section>
    );
  const ran = seenAgo(review.at, now);
  return (
    <section className={PANEL} aria-label="Review">
      <p className="text-[0.92rem]">{review.brief}</p>
      {review.actions.length ? (
        <Section title="Do next">
          <ol className="grid gap-1.5 pl-5">
            {review.actions.map((a, n) => (
              <li key={`${a.ticket}-${n}`} className={ROW}>
                <IdLink id={a.ticket} />
                <TicketButton id={a.ticket} onOpen={onTicket}>
                  {a.action}
                </TicketButton>
                <span className={META}>{a.why}</span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}
      {review.stale.length ? (
        <Section title="Stale">
          <ul className="grid gap-1.5">
            {review.stale.map((s, n) => (
              <li key={`${s.ticket}-${n}`} className={ROW}>
                <IdLink id={s.ticket} />
                <span>
                  <Inline text={s.why} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {review.suggestions.length ? (
        <Section title="Suggestions">
          <ul className="grid gap-1.5">
            {review.suggestions.map((s, n) => (
              <li key={`${s.ticket}-${n}`} className={ROW}>
                <IdLink id={s.ticket} />
                <span>
                  <Inline text={s.why} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={META}>
          {[
            `reviewed ${ran}`,
            review.cost === null ? null : usd(review.cost, 2),
            review.model
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <ReviewNow can={can} busy={busy} note={note} onReview={onReview} />
      </div>
    </section>
  );
};

/** A finding's AI chip: its kind, coloured by severity */
export const FindingChip = ({ f }: { f: ReviewFinding }) => {
  const chip = findingChip(f);
  return <Chip kind={chip.kind}>{chip.text}</Chip>;
};

type FindingProps = {
  finding: ReviewFinding;
  can: boolean;
  busy: boolean;
  /** Why the last dismissal did not go through */
  note: string | undefined;
  onDismiss: (finding: string, note: string) => void;
};

/** One finding in the Ticket sheet: kind, fix and evidence, and Dismiss with an optional note */
const Finding = ({ finding, can, busy, note, onDismiss }: FindingProps) => {
  const [text, setText] = useState('');
  return (
    <li className="grid min-w-0 gap-1.5" data-finding={finding.id}>
      <div className={ROW}>
        <FindingChip f={finding} />
        <span>{finding.fix}</span>
      </div>
      {finding.evidence.length ? (
        <ul className={`${META} list-disc pl-5`}>
          {finding.evidence.map((e, n) => (
            <li key={n}>
              <Inline text={e} />
            </li>
          ))}
        </ul>
      ) : null}
      {can ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            className="min-w-0 flex-1 rounded-[8px] border border-[color:var(--line)] bg-[color:var(--sunk)] px-2.5 py-1.5 text-[0.85rem]"
            aria-label={`Note for dismissing ${finding.id}`}
            placeholder="Why (optional)"
            maxLength={NOTE_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            type="button"
            className={WSNOOZE_CARD}
            data-dismiss={finding.id}
            disabled={busy}
            onClick={() => onDismiss(finding.id, text)}
          >
            Dismiss
          </button>
          {note ? <span className={WNOTE}>{note}</span> : null}
        </div>
      ) : null}
    </li>
  );
};

/** The Ticket sheet's AI findings for a ticket; nothing without any */
export const FindingsPart = ({
  findings,
  can,
  dismissing,
  notes,
  onDismiss
}: {
  findings: readonly ReviewFinding[];
  can: boolean;
  dismissing: ReadonlySet<string>;
  notes: ReadonlyMap<string, string>;
  onDismiss: (finding: string, note: string) => void;
}) =>
  findings.length ? (
    <Section title="AI review">
      <ul className="grid gap-3">
        {findings.map((f) => (
          <Finding
            key={f.id}
            finding={f}
            can={can}
            busy={dismissing.has(f.id)}
            note={notes.get(f.id)}
            onDismiss={onDismiss}
          />
        ))}
      </ul>
    </Section>
  ) : null;
