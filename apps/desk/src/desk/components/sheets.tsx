import { type ReactElement, useLayoutEffect, useRef } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { type Model, shipped } from '../model';
import { chartHeight, chartKind } from '../render/charts';
import { SHEETS as HTML_SHEETS } from '../render/sheets';
import { spendDays } from '../spend';
import type { DeskState, SheetId } from '../state';

import { BeforeSheet, type WaitActions } from './before';
import { ShippedChart, SpendChart } from './charts';

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

const legacy = (id: Exclude<SheetId, 'before'>): SheetDef => ({
  title: HTML_SHEETS[id].title,
  sub: HTML_SHEETS[id].sub,
  Body: ({ m, state, now }) => (
    <LegacyBody
      html={HTML_SHEETS[id].body(m, state, now)}
      state={state}
      now={now}
    />
  )
});

/** Every sheet by id; a new SheetId fails to compile until it has an entry */
export const SHEETS: Record<SheetId, SheetDef> = {
  before: {
    title: HTML_SHEETS.before.title,
    sub: HTML_SHEETS.before.sub,
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
  next: legacy('next'),
  review: legacy('review'),
  handoffs: legacy('handoffs'),
  session: legacy('session'),
  limit: legacy('limit'),
  scheduler: legacy('scheduler'),
  runs: legacy('runs'),
  timers: legacy('timers'),
  plan: legacy('plan'),
  activity: legacy('activity'),
  shipped: legacy('shipped'),
  effort: legacy('effort'),
  all: legacy('all'),
  ideas: legacy('ideas')
};
