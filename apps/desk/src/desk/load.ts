import { type Adapter, type DataFailure } from '../data';
import { IDEA_LABEL, type OpenStatusType } from '../linear';

import { RETRACT, STATES } from './constants';
import { agentState, ideaVerdict, openIssues } from './model';
import { byCreated, parseHandoffs, parseIdea, parsePlan } from './parsers';
import type { DeskState } from './state';

const SERVER = 'Linear';
const DETAIL_DELAY = 150;
export const DETAIL_STALE_MS = 60000;
export const HANDOFF_STALE_MS = 30000;
export const REASON_STALE_MS = 600000;

export type LoaderOptions = {
  adapter: Adapter;
  state: DeskState;
  render: () => void;
};

export type Loader = {
  /** Starts every watch; each answer lands in the state and renders */
  watchAll: () => void;
  /** Stops the loader: a pending details load is cancelled and every answer or event still on its way is dropped, so a replaced loader writes nothing more */
  stop: () => void;
  /** Drops the cached details and reads them again */
  refresh: () => Promise<void>;
};

const failure = (error: unknown): DataFailure =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof error.code === 'string' &&
  'message' in error &&
  typeof error.message === 'string'
    ? { code: error.code, message: error.message }
    : { code: 'bad_response', message: String(error) };

const prFromAttachments = (atts: readonly { url: string }[]): number | null => {
  for (const a of atts) {
    const n = a.url.match(
      /^https:\/\/github\.com\/codeware-sthlm\/cdwr\/pull\/(\d+)/
    )?.[1];
    if (n) return Number(n);
  }
  return null;
};

export const createLoader = ({
  adapter,
  state,
  render
}: LoaderOptions): Loader => {
  let stopped = false;

  // Errors of per-ticket requests, for ids that are no longer asked for, would linger
  const dropErrors = (
    prefix: string,
    keep: ReadonlySet<string> = new Set()
  ) => {
    for (const key of [...state.errors.keys()])
      if (key.startsWith(prefix) && !keep.has(key.slice(prefix.length)))
        state.errors.delete(key);
  };

  // A newer load supersedes an older one: whatever the older one answers is dropped, so its
  // failures can't bring back errors the newer one pruned
  let generation = 0;
  const loadDetails = async (): Promise<void> => {
    const current = ++generation;
    const stale = (): boolean => stopped || current !== generation;
    const { ideas, runs } = state.data;
    const ids = new Set(
      openIssues(state.data)
        .filter((i) => agentState(i))
        .map((i) => i.id)
    );
    for (const i of ideas || [])
      if (ideaVerdict(i) === 'to decide') ids.add(i.id);
    const v = runs?.qv;
    if (v)
      for (const x of [
        ...v.next,
        ...v.parked,
        ...v.table.before,
        ...v.table.after
      ])
        ids.add(x.ticket);
    const handoffIds = v
      ? v.table.after.filter((x) => x.kind === 'handoffs').map((x) => x.ticket)
      : [];
    // The discard word of a cancelled idea is its last comment, as the suggest-improvement skill reads it
    const cancelled = (ideas || []).filter((i) => i.statusType === 'canceled');
    dropErrors('detail:', ids);
    dropErrors('handoffs:', new Set(handoffIds));
    dropErrors('reason:', new Set(cancelled.map((i) => i.id)));
    await Promise.all(
      [...ids].map(async (id) => {
        try {
          const r = await adapter.callTool(
            SERVER,
            'get_issue',
            { id },
            { cache: { staleTime: DETAIL_STALE_MS } }
          );
          if (stale()) return;
          const p = r.payload;
          state.details.set(id, {
            ...parsePlan(p.description),
            idea: parseIdea(p.description),
            blockedBy: p.relations.blockedBy.map((b) => b.id),
            pr: prFromAttachments(p.attachments)
          });
          state.errors.delete('detail:' + id);
        } catch (e) {
          if (stale()) return;
          state.errors.set('detail:' + id, failure(e));
        }
      })
    );
    if (stale()) return;
    await Promise.all(
      handoffIds.map(async (id) => {
        try {
          const r = await adapter.callTool(
            SERVER,
            'list_comments',
            { issueId: id },
            { cache: { staleTime: HANDOFF_STALE_MS } }
          );
          if (stale()) return;
          state.liveHandoffs.set(id, parseHandoffs(r.payload.comments));
          state.errors.delete('handoffs:' + id);
        } catch (e) {
          if (stale()) return;
          state.errors.set('handoffs:' + id, failure(e));
        }
      })
    );
    if (stale()) return;
    await Promise.all(
      cancelled
        .filter((i) => !state.ideaReasons.has(i.id))
        .map(async (i) => {
          try {
            const r = await adapter.callTool(
              SERVER,
              'list_comments',
              { issueId: i.id },
              { cache: { staleTime: REASON_STALE_MS } }
            );
            if (stale()) return;
            const lastComment = r.payload.comments
              .slice()
              .sort(byCreated)
              .pop();
            state.ideaReasons.set(
              i.id,
              lastComment
                ? lastComment.body.replace(/\s+/g, ' ').trim().slice(0, 80)
                : ''
            );
            state.errors.delete('reason:' + i.id);
          } catch (e) {
            if (stale()) return;
            state.errors.set('reason:' + i.id, failure(e));
          }
        })
    );
    if (stale()) return;
    render();
  };

  let detailTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleDetails = (): void => {
    clearTimeout(detailTimer);
    detailTimer = setTimeout(() => void loadDetails(), DETAIL_DELAY);
  };

  const watchAll = (): void => {
    for (const s of STATES) watchState(s);
    adapter.watchTool('Supabase', 'runs', {}, (ev) => {
      if (stopped) return;
      if (ev.type === 'data') {
        state.data.runs = ev.result.payload;
        state.errors.delete('runs');
        scheduleDetails();
      } else {
        state.errors.set('runs', ev.error);
        if (RETRACT.includes(ev.error.code)) state.data.runs = null;
      }
      render();
    });
    adapter.watchTool('Supabase', 'usage', {}, (ev) => {
      if (stopped) return;
      if (ev.type === 'data') {
        state.data.usage = ev.result.payload;
        state.errors.delete('usage');
      } else {
        state.errors.set('usage', ev.error);
        if (RETRACT.includes(ev.error.code)) state.data.usage = null;
      }
      render();
    });
    adapter.watchTool('Supabase', 'activity', {}, (ev) => {
      if (stopped) return;
      if (ev.type === 'data') {
        state.data.activity = ev.result.payload;
        state.errors.delete('activity');
      } else {
        state.errors.set('activity', ev.error);
        if (RETRACT.includes(ev.error.code)) state.data.activity = null;
      }
      render();
    });
    adapter.watchTool('Supabase', 'hostMetrics', {}, (ev) => {
      if (stopped) return;
      if (ev.type === 'data') {
        state.data.hostMetrics = ev.result.payload;
        state.errors.delete('hostMetrics');
      } else {
        state.errors.set('hostMetrics', ev.error);
        if (RETRACT.includes(ev.error.code)) state.data.hostMetrics = null;
      }
      render();
    });
    adapter.watchTool(SERVER, 'list_issues', { label: IDEA_LABEL }, (ev) => {
      if (stopped) return;
      if (ev.type === 'data') {
        state.data.ideas = ev.result.payload.issues;
        state.errors.delete('ideas');
        render();
        scheduleDetails();
      } else {
        state.errors.set('ideas', ev.error);
        if (RETRACT.includes(ev.error.code)) state.data.ideas = null;
        render();
      }
    });
    adapter.watchTool(SERVER, 'list_issues', { state: 'completed' }, (ev) => {
      if (stopped) return;
      if (ev.type === 'data') {
        state.data.closed = ev.result.payload.issues;
        state.errors.delete('list:completed');
        render();
      } else {
        state.errors.set('list:completed', ev.error);
        if (RETRACT.includes(ev.error.code)) state.data.closed = null;
        render();
      }
    });
  };

  const watchState = (s: OpenStatusType): void => {
    adapter.watchTool(SERVER, 'list_issues', { state: s }, (ev) => {
      if (stopped) return;
      if (ev.type === 'data') {
        state.data.buckets.set(s, ev.result.payload.issues);
        state.data.storedAt = ev.result.cache.storedAt;
        state.errors.delete('list:' + s);
        render();
        scheduleDetails();
      } else {
        state.errors.set('list:' + s, ev.error);
        if (RETRACT.includes(ev.error.code)) state.data.buckets.delete(s);
        render();
      }
    });
  };

  const refresh = async (): Promise<void> => {
    try {
      await Promise.all([
        adapter.invalidate(SERVER),
        adapter.invalidate('Supabase')
      ]);
    } catch {
      // Whatever is cached is read again below
    }
    if (stopped) return;
    state.details.clear();
    state.liveHandoffs.clear();
    state.ideaReasons.clear();
    dropErrors('detail:');
    dropErrors('handoffs:');
    dropErrors('reason:');
    await loadDetails();
  };

  const stop = (): void => {
    stopped = true;
    clearTimeout(detailTimer);
  };

  return { watchAll, refresh, stop };
};
