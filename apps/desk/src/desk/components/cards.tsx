import type { MouseEvent } from 'react';

import { ofKind } from '../live';
import type { Model } from '../model';
import type { Detail, SheetId } from '../state';

import { SessionCard, UnknownSession } from './session';
import { WaitingCard } from './waiting';

type Props = {
  m: Model;
  details: ReadonlyMap<string, Detail>;
  now: Date;
  /** Whether the fold of snoozed rows is open */
  snoozedOpen: boolean;
  onSnoozedOpen: (open: boolean) => void;
  onSheet: (id: SheetId) => void;
};

/** A click anywhere on a card opens its sheet, but not one on a link or on the fold's trigger */
const opens =
  (id: SheetId, onSheet: (id: SheetId) => void) => (e: MouseEvent) => {
    if (e.target instanceof Element && e.target.closest('a, .snoozed-summary'))
      return;
    onSheet(id);
  };

/** The two cards: the session's, or the unknown-state card in its place, and Waiting on you */
export const Cards = ({
  m,
  details,
  now,
  snoozedOpen,
  onSnoozedOpen,
  onSheet
}: Props) => (
  <>
    {ofKind(m.problems, 'unknown')[0] ? (
      <UnknownSession m={m} />
    ) : (
      <SessionCard
        m={m}
        details={details}
        now={now}
        onClick={opens('session', onSheet)}
      />
    )}
    <WaitingCard
      m={m}
      details={details}
      now={now}
      open={snoozedOpen}
      onOpenChange={onSnoozedOpen}
      onClick={opens('before', onSheet)}
    />
  </>
);
