import {
  ACTIVITY_STALE_MIN,
  AGENT_AVATAR,
  ROLES,
  SHIP_DAYS
} from '../constants';
import { ageText, dayLabel, mtok, plural, tidy, usd } from '../format';
import { type Model, activityMissing, agentState, shipped } from '../model';
import {
  type TicketCost,
  perTicketAverage,
  spendDays,
  spendStats,
  ticketCosts,
  tokenTotals,
  unattributedTotal
} from '../spend';
import type { DeskState, Filter } from '../state';
import { isTicketId } from '../view/ids';

import { IdeaCard } from './before';
import { ShippedChart, SpendChart } from './charts';
import { Chip, Empty, Item, PvMore, Table } from './items';
import { IdLink, Inline } from './links';
import { KNOBS, PV_STATS, ROLE_BG, STALE } from './sheet-ui';

// The sheets of the page's data: the activity table, what shipped, what it cost, every open ticket and the suggestions

type BodyProps = { m: Model; state: DeskState; now: Date };

const CHART_HEIGHT = 200;

const FILTERS: readonly (readonly [Filter, string])[] = [
  ['all', 'All open'],
  ['todo', 'Todo + In Progress'],
  ['agent', 'Agent only']
];

// ---------- Activity ----------

const NO_ACTIVITY =
  'No activity yet. The scheduler publishes it after its next run.';

/** A discarded idea's reason; the spec reads the class */
const REASON = 'reason text-[0.8rem] text-[color:var(--muted)] italic';

/** An actor's pill; the caller adds the colours */
const TAG =
  'inline-block rounded-[999px] px-[7px] text-[0.72rem] font-semibold';

/** The activity table's cells: the Change column wraps, the rest stay on one line; its ticket links show the underline on hover only */
const ACT_CELL =
  'border-b border-[color:var(--line)] px-1.5 py-[5px] text-left align-baseline [&_a.id]:no-underline [&_a.id:hover]:underline';
const ACT_TH = `${ACT_CELL} font-semibold text-[color:var(--muted)]`;
const ACT_TD = `${ACT_CELL} whitespace-nowrap`;
const ACT_TD_LAST = `${ACT_CELL} w-full [overflow-wrap:anywhere]`;

const Actor = ({ a }: { a: string }) =>
  a === 'agent' ? (
    <span
      className={`${TAG} bg-[color:var(--accent-soft)] text-[color:var(--accent)]`}
    >
      <img
        className="-mt-0.5 mr-1 -ml-1 inline-block size-3.5 flex-none rounded-full"
        src={AGENT_AVATAR}
        alt=""
      />
      agent
    </span>
  ) : a === 'scheduler' ? (
    <span
      className={`${TAG} bg-[color:var(--work-soft)] text-[color:var(--work)]`}
    >
      {a}
    </span>
  ) : a === 'unknown' ? (
    <span className="text-[color:var(--muted)]">unknown</span>
  ) : (
    a
  );

/** The Updated line, in the warning colour once it's older than ACTIVITY_STALE_MIN: the scheduler stops while the Mac sleeps */
const ActivityHead = ({ m, header }: { m: Model; header: string }) => {
  const age = m.activityAge;
  const warning =
    age !== null && age > ACTIVITY_STALE_MIN
      ? `The scheduler hasn't published for ${ageText(age)}. It stops while the Mac sleeps.`
      : '';
  return (
    <span className={warning ? STALE : ''} title={warning}>
      {header}
    </span>
  );
};

export const ActivityBody = ({
  m,
  state,
  onActFilter
}: {
  m: Model;
  state: DeskState;
  onActFilter: (ticket: string) => void;
}) => {
  const { activity } = state.data;
  if (!activity)
    return <Empty>The activity table hasn&apos;t loaded yet.</Empty>;
  if (activityMissing(activity)) return <Empty>{NO_ACTIVITY}</Empty>;
  const tickets = [
    ...new Set(activity.rows.map((r) => r.ticket).filter(isTicketId))
  ].sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  // A filter on a ticket that has left the window shows everything
  const picked = tickets.includes(state.ui.actFilter)
    ? state.ui.actFilter
    : 'all';
  const rows =
    picked === 'all'
      ? activity.rows
      : activity.rows.filter((r) => r.ticket === picked);
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[0.85rem] text-[color:var(--muted)]">
        <label>
          Ticket{' '}
          <select
            className="rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)] px-2 py-[5px] font-[family-name:var(--font-ui)] text-[0.85rem] leading-[normal] font-normal text-[color:var(--fg)]"
            aria-label="Filter by ticket"
            value={picked}
            onChange={(e) => onActFilter(e.target.value)}
          >
            <option value="all">All</option>
            {tickets.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <span>{plural(rows.length, 'event', 'events')}</span>
      </div>
      {activity.dropped ? <p className="rule">{activity.dropped}</p> : null}
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[0.8rem]">
            <thead>
              <tr>
                <th className={ACT_TH}>When</th>
                <th className={ACT_TH}>Ticket</th>
                <th className={ACT_TH}>Actor</th>
                <th className={ACT_TH}>Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, n) => (
                <tr key={n}>
                  <td className={ACT_TD}>
                    <time className="font-[family-name:var(--font-mono)] text-[0.76rem] leading-[normal] text-[color:var(--muted)] tabular-nums">
                      {r.when}
                    </time>
                  </td>
                  <td className={ACT_TD}>
                    <IdLink id={r.ticket} />
                  </td>
                  <td className={ACT_TD}>
                    <Actor a={r.actor} />
                  </td>
                  <td className={ACT_TD_LAST}>
                    <Inline text={r.change.replace(/\*\*/g, '')} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No events for this ticket in the window.</Empty>
      )}
      <p className="rule">
        From Linear&apos;s issue history of tickets that carried an{' '}
        <code>agent:*</code> label, and the scheduler&apos;s own runs. The agent
        writes as the queue&apos;s own Linear app user, and those changes say{' '}
        <b>agent</b>; so do older comments starting <code>**Agent</code>, from
        when it wrote as Håkan. Other changes carry their author&apos;s name.
        Updated <ActivityHead m={m} header={activity.header} />.
      </p>
    </>
  );
};

// ---------- Closed, spend, cost per ticket ----------

export const ShippedBody = ({
  state,
  now
}: Pick<BodyProps, 'state' | 'now'>) => {
  const s = shipped(state.data.closed, now);
  const daysWith = s.days.filter((d) => d.items.length).reverse();
  return (
    <>
      <div className={PV_STATS}>
        <div>
          <b>{s.total}</b>
          <span>last {SHIP_DAYS} days</span>
        </div>
        <div>
          <b>{s.week}</b>
          <span>last 7 days</span>
        </div>
      </div>
      <div className="chart-slot">
        <ShippedChart days={s.days} height={CHART_HEIGHT} />
      </div>
      {daysWith.length ? (
        daysWith.map((d) => (
          <div className="group" key={d.key}>
            <h3>{`${dayLabel(d.key)} · ${d.items.length}`}</h3>
            <ul>
              {d.items.map((i) => (
                <Item key={i.id} details={state.details} i={i} state="plain" />
              ))}
            </ul>
          </div>
        ))
      ) : (
        <Empty>No agent ticket closed in the last {SHIP_DAYS} days.</Empty>
      )}
      <p className="rule">
        Tickets that carried an agent label when they closed, by the day they
        closed.
      </p>
    </>
  );
};

const Legend = () => (
  <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[0.78rem] text-[color:var(--muted)]">
    {ROLES.map((r) => (
      <span key={r} className="inline-flex items-center gap-1.5">
        <i
          className={`inline-block size-2.5 rounded-[3px] ${ROLE_BG[r]}`}
          aria-hidden="true"
        ></i>
        {r}
      </span>
    ))}
  </div>
);

const HBars = ({ rows, max }: { rows: readonly TicketCost[]; max: number }) => {
  const top = Math.max(1, ...rows.map((r) => r.total));
  return (
    <>
      <div className="grid gap-1.5 text-[0.8rem]">
        {rows.slice(0, max).map((r) => (
          <div
            className="grid grid-cols-[5.6em_minmax(0,1fr)_4.6em] items-center gap-2"
            key={r.i.id}
            title={
              `${r.i.id}: ` +
              ROLES.map((k) => `${k} ${usd(r[k], 2)}`).join(', ')
            }
          >
            <a
              className="id mr-0"
              href={r.i.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {r.i.id}
            </a>
            <span
              className="flex h-2.5 min-w-0 gap-0.5 [&_i:last-child]:rounded-r-[4px]"
              aria-hidden="true"
            >
              {ROLES.filter((k) => r[k] > 0).map((k) => (
                <i
                  key={k}
                  className={`block h-full min-w-0 ${ROLE_BG[k]}`}
                  style={{ width: `${(r[k] / top) * 100}%` }}
                ></i>
              ))}
            </span>
            <b className="text-right font-semibold tabular-nums">
              {usd(r.total)}
            </b>
          </div>
        ))}
      </div>
      <PvMore n={rows.length - max} />
    </>
  );
};

type Usage = NonNullable<DeskState['data']['usage']>;

const pct = (a: number, b: number): string =>
  b ? Math.round((a / b) * 100) + '%' : '–';

const TicketCosts = ({
  usage,
  rows
}: {
  usage: Usage;
  rows: readonly TicketCost[];
}) => (
  <>
    {rows.length ? (
      <HBars rows={rows} max={rows.length} />
    ) : (
      <Empty>
        No agent ticket closed in the last {SHIP_DAYS} days has usage recorded.
      </Empty>
    )}
    <div className="group">
      <h3>Every ticket with usage</h3>
      <Table
        head={['Ticket', ...ROLES, 'Total', 'Output', 'Cache read']}
        rows={usage.tickets.map((t) => [
          isTicketId(t.ticket) ? <IdLink id={t.ticket} /> : tidy(t.ticket),
          ...ROLES.map((r) => usd(t[r], 2)),
          usd(t.total, 2),
          mtok(t.output),
          mtok(t.cacheRead)
        ])}
      />
    </div>
    <p className="rule">
      Closed agent tickets from the last {SHIP_DAYS} days, by the API-equivalent
      cost of sessions on their branch over the last {usage.windowDays} days.
      Work before that window isn&apos;t counted.
    </p>
  </>
);

const Spend = ({
  usage,
  days,
  perTicket
}: {
  usage: Usage;
  days: ReturnType<typeof shipped>['days'];
  perTicket: number | null;
}) => {
  const s = spendStats(usage, days);
  const tok = tokenTotals(usage.models);
  const unattributed = unattributedTotal(usage);
  return (
    <>
      <div className={PV_STATS}>
        <div>
          <b>{usd(s.total)}</b>
          <span>last {SHIP_DAYS} days</span>
        </div>
        <div>
          <b>{usd(s.week)}</b>
          <span>last 7 days</span>
        </div>
        <div>
          <b>{usd(perTicket)}</b>
          <span>per closed ticket</span>
        </div>
        <div>
          <b>{pct(tok.cacheRead, tok.all)}</b>
          <span>of tokens are cache reads</span>
        </div>
        <div>
          <b>{pct(unattributed, usage.total)}</b>
          <span>unattributed</span>
        </div>
      </div>
      <div className="chart-slot">
        <SpendChart days={spendDays(usage, days)} height={CHART_HEIGHT} />
      </div>
      <div className="group">
        <h3>By model</h3>
        <Table
          head={[
            'Model',
            'Cost',
            'Output',
            'Cache read',
            'Cache write',
            'Input'
          ]}
          rows={usage.models
            .slice()
            .sort((a, b) => b.cost - a.cost)
            .map((m) => [
              m.model,
              usd(m.cost, 2),
              mtok(m.output),
              mtok(m.cacheRead),
              mtok(m.cacheWrite),
              mtok(m.input)
            ])}
        />
      </div>
      <div className="group">
        <h3>What moves it</h3>
        <ul className={KNOBS}>
          <li>
            <b>Model per role</b>
            <span>
              Fable 5.1 costs 2.5× Opus 5.5 per token; the orchestrator runs on
              whatever the session uses, the implementer on Sonnet.
            </span>
          </li>
          <li>
            <b>Session length</b>
            <span>
              Every turn re-reads the conversation as cache reads, so a long
              session grows roughly with its square. <code>/clear</code> between
              tickets and compaction between steps cut it.
            </span>
          </li>
          <li>
            <b>
              <code>AGENT_QUEUE_BUDGET_USD</code>
            </b>
            <span>
              Caps one planning run (default 5). A run that hits it shows as{' '}
              <code>cap</code> on the scheduler.
            </span>
          </li>
          <li>
            <b>
              <code>AGENT_QUEUE_IMPLEMENT_BUDGET_USD</code> and the daily cap
            </b>
            <span>
              A session the scheduler starts stops at $15, and these sessions
              stop launching for the day at $40 (
              <code>AGENT_QUEUE_IMPLEMENT_CAP_USD</code>).
            </span>
          </li>
          <li>
            <b>Run interval</b>
            <span>
              Idle runs start no model, so the interval only matters when
              there&apos;s something to plan.
            </span>
          </li>
        </ul>
      </div>
      <div className="group">
        <h3>Per day</h3>
        <Table
          head={['Day', ...ROLES, 'Total']}
          rows={s.days
            .filter((d) => d.total)
            .reverse()
            .map((d) => [
              dayLabel(d.key),
              ...ROLES.map((r) => usd(d[r], 2)),
              usd(d.total, 2)
            ])}
        />
      </div>
      <p className="rule">
        API-equivalent cost of the local Claude Code transcripts of this repo
        and its worktrees, at prices from {usage.pricesDate}. Nothing is billed
        on Max; the cost is the weight the allowance follows. Planning is the
        scheduled planner; implementing is subagents; orchestrating is every
        other session. Planning runs on <code>origin/main</code>, so its cost is
        never tied to a ticket.
        {usage.unpriced.length
          ? ` Not priced, left out: ${usage.unpriced.join(', ')}.`
          : ''}{' '}
        Updated {usage.updated}.
      </p>
    </>
  );
};

/** Cost per closed ticket, then the spend per day and model, from one usage table */
export const EffortBody = ({
  state,
  now
}: Pick<BodyProps, 'state' | 'now'>) => {
  const { usage, closed } = state.data;
  if (!usage)
    return (
      <Empty>
        No usage yet. The scheduler writes the <code>usage</code> table at most
        once an hour once <code>cdwr agent install</code> has run with COD-533.
      </Empty>
    );
  const { days } = shipped(closed, now);
  const rows = ticketCosts(usage, days);
  return (
    <>
      <Legend />
      <TicketCosts usage={usage} rows={rows} />
      <Spend usage={usage} days={days} perTicket={perTicketAverage(rows)} />
    </>
  );
};

// ---------- All open tickets ----------

export const AllBody = ({
  m,
  state,
  onFilter
}: {
  m: Model;
  state: DeskState;
  onFilter: (filter: Filter) => void;
}) => {
  const { filter } = state.ui;
  const queuePos = new Map(m.next.map((x, n) => [x.ticket, n + 1]));
  const shown = m.all.filter((i) =>
    filter === 'all'
      ? true
      : filter === 'agent'
        ? agentState(i) !== null
        : ['unstarted', 'started'].includes(i.statusType) &&
          i.status !== 'Triage'
  );
  return (
    <>
      <div className="filters" role="group" aria-label="Filter">
        {FILTERS.map(([f, label]) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => onFilter(f)}
          >
            {label}
          </button>
        ))}
      </div>
      {shown.length ? (
        <ol>
          {shown.map((i) => {
            const s = agentState(i);
            const pos = queuePos.get(i.id);
            return (
              <Item
                key={i.id}
                details={state.details}
                i={i}
                state={s ?? 'plain'}
                rank={m.all.indexOf(i) + 1}
                side={
                  s ? (
                    <Chip kind={s}>
                      {pos !== undefined ? 'agent #' + pos : s}
                    </Chip>
                  ) : null
                }
              />
            );
          })}
        </ol>
      ) : (
        <Empty>No tickets match this filter.</Empty>
      )}
      <p className="rule">
        Manual drag order in a Linear view isn&apos;t exposed through the
        connector.
      </p>
    </>
  );
};

// ---------- Suggestions ----------

export const IdeasBody = ({ m, state, now }: BodyProps) => {
  const { ideas } = state.data;
  if (!ideas)
    return (
      <Empty>
        {state.errors.has('ideas')
          ? "The suggestions couldn't load from Linear."
          : 'Loading the suggestions…'}
      </Empty>
    );
  const { details, ideaReasons } = state;
  const s = m.suggested;
  const lastText = !s ? (
    <>
      No <code>Suggested:</code> value in <code>queue_state</code> yet. The
      first idle run after 06:00 writes it, once <code>cdwr agent install</code>{' '}
      has run with COD-579.
    </>
  ) : s.kind === 'suggested' ? (
    <>
      {s.date} · suggested <IdLink id={s.ticket} /> {s.title}
    </>
  ) : s.kind === 'open' ? (
    <>
      {s.date} · <IdLink id={s.ticket} /> still waits on your verdict, so no new
      idea
    </>
  ) : (
    `${s.date} · ${s.text}`
  );
  const month = now.getTime() - 30 * 864e5;
  const recent = <T extends { createdAt: string }>(
    xs: readonly T[],
    at: (i: T) => string | null
  ): number =>
    xs.filter((i) => Date.parse(at(i) || i.createdAt) >= month).length;
  const notWorth = m.ideasDiscarded.filter(
    (i) =>
      Date.parse(i.canceledAt || i.createdAt) >= month &&
      /not worth/i.test(ideaReasons.get(i.id) || '')
  ).length;
  return (
    <>
      <div className="group">
        <h3>Last suggest run</h3>
        <div
          className={
            s && ['cap', 'failed', 'other'].includes(s.kind) ? 'empty' : 'rule'
          }
        >
          {lastText}
        </div>
      </div>
      {m.ideasPending.length ? (
        <div className="group">
          <h3>{`To decide · ${m.ideasPending.length}`}</h3>
          {m.ideasPending.map((i) => (
            <IdeaCard key={i.id} i={i} details={details} />
          ))}
        </div>
      ) : (
        <div className="group">
          <h3>To decide</h3>
          <Empty>
            Nothing to decide. The next idea comes in the first idle run after
            06:00, and only when the agent found evidence for one.
          </Empty>
        </div>
      )}
      <div className={PV_STATS}>
        <div>
          <b>{recent(m.ideasAccepted, (i) => i.completedAt)}</b>
          <span>accepted, 30 days</span>
        </div>
        <div>
          <b>{recent(m.ideasDiscarded, (i) => i.canceledAt)}</b>
          <span>discarded, 30 days</span>
        </div>
        <div>
          <b>{notWorth}</b>
          <span>{'of them "not worth it"'}</span>
        </div>
      </div>
      {m.ideasAccepted.length ? (
        <div className="group">
          <h3>{`Accepted · ${m.ideasAccepted.length}`}</h3>
          <ul>
            {m.ideasAccepted.map((i) => {
              const a = agentState(i);
              return (
                <Item
                  key={i.id}
                  details={details}
                  i={i}
                  state={a || 'ready'}
                  side={<Chip kind={a ?? 'ready'}>{a ?? 'done'}</Chip>}
                />
              );
            })}
          </ul>
        </div>
      ) : null}
      {m.ideasDiscarded.length ? (
        <div className="group">
          <h3>{`Discarded · ${m.ideasDiscarded.length}`}</h3>
          <ul>
            {m.ideasDiscarded.map((i) => {
              const reason = ideaReasons.get(i.id);
              return (
                <Item
                  key={i.id}
                  details={details}
                  i={i}
                  state="plain"
                  side={i.canceledAt ? dayLabel(i.canceledAt.slice(0, 10)) : ''}
                  note={
                    reason === undefined ? null : reason ? (
                      <span className={REASON}>{`“${reason}”`}</span>
                    ) : (
                      <span className={REASON}>no reason given</span>
                    )
                  }
                />
              );
            })}
          </ul>
        </div>
      ) : null}
      <p className="rule">
        Tickets with the <code>Source: agent-idea</code> label from the last 60
        days. The scheduler proposes nothing while one waits on your verdict.
        From 2026-11-16 the skill reviews the month: more than half discarded as
        &quot;not worth it&quot; and its one idea of the day is to go weekly.
      </p>
    </>
  );
};
