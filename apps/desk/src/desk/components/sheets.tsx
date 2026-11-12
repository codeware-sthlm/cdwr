import { type ReactElement, useLayoutEffect, useRef } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { SHIP_DAYS } from '../constants';
import { type Model, shipped } from '../model';
import { chartHeight, chartKind } from '../render/charts';
import {
  renderActivity,
  renderAll,
  renderEffort,
  renderIdeas,
  renderShipped
} from '../render/sheets';
import { spendDays } from '../spend';
import type { DeskState, SheetId } from '../state';

import { BeforeSheet, type WaitActions } from './before';
import { ShippedChart, SpendChart } from './charts';
import { HandoffsBody, LimitBody, NextBody, ReviewBody } from './queue-bodies';
import {
  PlanBody,
  RunsBody,
  SchedulerBody,
  SessionBody,
  TimersBody
} from './scheduler-bodies';

/** What a sheet's controls do; the state they change stays with the page */
export type SheetActions = {
  wait: WaitActions;
  /** The Waiting on you sheet's snoozed fold */
  onSnoozedOpen: (open: boolean) => void;
};

export type SheetProps = {
  m: Model;
  state: DeskState;
  now: Date;
  actions: SheetActions;
};

export type SheetDef = {
  title: string;
  sub: string;
  Body: (p: SheetProps) => ReactElement;
};

/** The chart a `[data-chart]` slot of an HTML body asks for */
const slotChart = (slot: HTMLElement, state: DeskState, now: Date) => {
  const { days } = shipped(state.data.closed, now);
  const height = chartHeight(slot.dataset.h);
  return chartKind(slot.dataset.chart) === 'spend' ? (
    <SpendChart days={spendDays(state.data.usage, days)} height={height} />
  ) : (
    <ShippedChart days={days} height={height} />
  );
};

/**
 * A body still written as HTML, until it moves to a component. The body is rewritten only when
 * its HTML changes; its charts are roots on the `[data-chart]` slots that re-render with new
 * data, so a hover survives a render.
 */
const LegacyBody = ({
  html,
  state,
  now
}: {
  html: string;
  state: DeskState;
  now: Date;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const roots = useRef<Root[]>([]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = html;
    const made = Array.from(
      el.querySelectorAll<HTMLElement>('[data-chart]'),
      (slot) => createRoot(slot)
    );
    roots.current = made;
    return () => {
      // Not during this commit: a root can't unmount while React renders
      queueMicrotask(() => made.forEach((r) => r.unmount()));
    };
  }, [html]);
  useLayoutEffect(() => {
    ref.current
      ?.querySelectorAll<HTMLElement>('[data-chart]')
      .forEach((slot, n) =>
        roots.current[n]?.render(slotChart(slot, state, now))
      );
  });
  return <div ref={ref} className="contents" />;
};

const legacy = (
  title: string,
  sub: string,
  html: (m: Model, state: DeskState, now: Date) => string
): SheetDef => ({
  title,
  sub,
  Body: ({ m, state, now }) => (
    <LegacyBody html={html(m, state, now)} state={state} now={now} />
  )
});

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
  activity: legacy(
    'Activity',
    "Every status, label, description and comment change on agent tickets, plus the scheduler's runs, newest first",
    renderActivity
  ),
  shipped: legacy(
    'Closed by the agent',
    `Agent tickets closed per day, last ${SHIP_DAYS} days`,
    (_m, state, now) => renderShipped(state, now)
  ),
  effort: legacy(
    'Effort, 30 days',
    'API-equivalent cost, simulated on Max: per closed ticket, then per day and model',
    (_m, state, now) => renderEffort(state, now)
  ),
  all: legacy(
    'All open tickets',
    'Same order as the agent: status, priority, then age',
    renderAll
  ),
  ideas: legacy(
    'Agent suggestions',
    'One evidence-led idea a day, from the first idle run after 06:00. Accept it with agent:ready; discard it by cancelling with one word in a comment.',
    renderIdeas
  )
};
