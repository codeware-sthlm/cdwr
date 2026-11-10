import type { Model } from '../model';
import { ofKind } from '../render/problems';
import type { Detail } from '../state';

import { SessionCard, UnknownSession } from './session';
import { WaitingCard } from './waiting';

type Props = {
  m: Model;
  details: ReadonlyMap<string, Detail>;
  now: Date;
  /** Whether the fold of snoozed rows is open */
  snoozedOpen: boolean;
  onSnoozedOpen: (open: boolean) => void;
};

/** The two cards: the session's, or the unknown-state card in its place, and Waiting on you */
export const Cards = ({
  m,
  details,
  now,
  snoozedOpen,
  onSnoozedOpen
}: Props) => (
  <>
    {ofKind(m.problems, 'unknown')[0] ? (
      <UnknownSession m={m} />
    ) : (
      <SessionCard m={m} details={details} now={now} />
    )}
    <WaitingCard
      m={m}
      details={details}
      now={now}
      open={snoozedOpen}
      onOpenChange={onSnoozedOpen}
    />
  </>
);
