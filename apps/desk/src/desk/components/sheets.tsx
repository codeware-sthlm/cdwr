import type { ReactElement } from 'react';

import { SHIP_DAYS } from '../constants';
import type { Model } from '../model';
import type { DeskState, Filter, SheetId } from '../state';
import { ticketState } from '../view/ticket';

import { BeforeSheet, type WaitActions } from './before';
import {
  ActivityBody,
  AllBody,
  EffortBody,
  IdeasBody,
  ShippedBody
} from './data-bodies';
import { HandoffsBody, LimitBody, NextBody, ReviewBody } from './queue-bodies';
import {
  PlanBody,
  RunsBody,
  SchedulerBody,
  SessionBody,
  TimersBody
} from './scheduler-bodies';
import { TicketBody } from './ticket-body';

/** What a sheet's controls do; the state they change stays with the page */
export type SheetActions = {
  wait: WaitActions;
  /** Opens the Ticket sheet on a ticket, also from inside it */
  onTicket: (id: string) => void;
  /** Dismisses a finding of the review, with a note that may be empty */
  onDismiss: (finding: string, note: string) => void;
  /** The Waiting on you sheet's snoozed fold */
  onSnoozedOpen: (open: boolean) => void;
  /** The Activity sheet's ticket filter */
  onActFilter: (ticket: string) => void;
  /** The All sheet's filter */
  onFilter: (filter: Filter) => void;
};

export type SheetProps = {
  m: Model;
  state: DeskState;
  now: Date;
  actions: SheetActions;
};

export type SheetDef = {
  /** A function for a title that follows the state, as the Ticket sheet's does */
  title: string | ((m: Model, state: DeskState) => string);
  sub: string;
  Body: (p: SheetProps) => ReactElement;
};

/** Every sheet by id; a new SheetId fails to compile until it has an entry */
export const SHEETS: Record<SheetId, SheetDef> = {
  before: {
    title: 'Waiting on you, furthest along first',
    sub: "PRs to review, hand-offs to tick, plans to approve and questions to answer. Reply in the ticket's newest Agent comment.",
    Body: ({ m, state, now, actions }) => (
      <BeforeSheet
        m={m}
        state={state}
        now={now}
        open={state.ui.snoozedOpen}
        onOpenChange={actions.onSnoozedOpen}
        actions={actions.wait}
      />
    )
  },
  next: {
    title: 'What the agent takes next',
    sub: "In the order a session takes them, from the scheduler's queue view",
    Body: NextBody
  },
  review: {
    title: 'Review & check',
    sub: 'Open agent PRs · live via github_events',
    Body: ReviewBody
  },
  handoffs: {
    title: 'Hand-offs left',
    sub: "Unticked hand-off items of merged agent tickets, from each ticket's latest Agent: PR ready comment. Tick them in Linear.",
    Body: HandoffsBody
  },
  session: {
    title: 'Session',
    sub: "The work-queue session's heartbeat, and how the next step is decided",
    Body: SessionBody
  },
  limit: {
    title: 'Limit',
    sub: "Agent PRs in flight count: open reviews and tickets parked on their PR's checks. At the limit no new ticket starts; answers, reviews and parked work still resume.",
    Body: LimitBody
  },
  scheduler: {
    title: 'Scheduler',
    sub: 'The scheduled runs, from the runs table',
    Body: SchedulerBody
  },
  runs: {
    title: 'Runs today',
    sub: 'The scheduler runs that did something since midnight, from the runs table; idle runs are left out',
    Body: RunsBody
  },
  timers: {
    title: 'Timers',
    sub: "Every interval, window and timeout the queue runs on, and where it's set",
    Body: TimersBody
  },
  plan: {
    title: 'Plan usage',
    sub: "The Claude plan's 5-hour and 7-day usage with a projection to each reset, and what the last 24 hours cost",
    Body: PlanBody
  },
  activity: {
    title: 'Activity',
    sub: "Every status, label, description and comment change on agent tickets, plus the scheduler's runs, newest first",
    Body: ({ m, state, actions }) => (
      <ActivityBody m={m} state={state} onActFilter={actions.onActFilter} />
    )
  },
  shipped: {
    title: 'Closed by the agent',
    sub: `Agent tickets closed per day, last ${SHIP_DAYS} days`,
    Body: ShippedBody
  },
  effort: {
    title: 'Effort, 30 days',
    sub: 'API-equivalent cost, simulated on Max: per closed ticket, then per day and model',
    Body: EffortBody
  },
  all: {
    title: 'All open tickets',
    sub: 'Same order as the agent: status, priority, then age',
    Body: ({ m, state, actions }) => (
      <AllBody m={m} state={state} onFilter={actions.onFilter} />
    )
  },
  ideas: {
    title: 'Agent suggestions',
    sub: 'One evidence-led idea a day, from the first idle run after 06:00. Accept it with agent:ready; discard it by cancelling with one word in a comment.',
    Body: IdeasBody
  },
  ticket: {
    title: (m, state) => {
      const id = state.ui.ticket;
      if (id === null) return 'Ticket';
      const title = ticketState(m, state, id).linear?.title;
      return title ? `${id} · ${title}` : id;
    },
    sub: 'Everything the desk holds for this ticket',
    Body: TicketBody
  }
};

/** The title a sheet shows now */
export const sheetTitle = (
  def: SheetDef,
  m: Model,
  state: DeskState
): string =>
  typeof def.title === 'function' ? def.title(m, state) : def.title;
