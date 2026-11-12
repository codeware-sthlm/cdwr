import { REFRESH_MS } from '../../data';
import { CLOSED_WINDOW_DAYS, IDEA_WINDOW_DAYS } from '../../linear';
import { ACTIVITY_STALE_MIN, GH_COMMIT, LIMIT, STUCK_MIN } from '../constants';
import {
  ageText,
  hhmm,
  planWhen,
  plural,
  seenAgo,
  shortAge,
  usd
} from '../format';
import { DETAIL_STALE_MS, HANDOFF_STALE_MS, REASON_STALE_MS } from '../load';
import { BURN_ROLES, type Model, type PlanWindow, isProblem } from '../model';
import { hostName, sessionLabel } from '../render/html';
import { headline } from '../render/session';
import type { DeskState } from '../state';
import type { Job } from '../types';

import { Gauge, Sparkline } from './charts';
import { Empty, Table } from './items';
import { IdLink, Inline } from './links';
import { Parts } from './session';

// The scheduler sheets: the session, the scheduled runs, their timers and the plan's usage

type BodyProps = { m: Model; state: DeskState; now: Date };

const MINUTE_MS = 60 * 1000;
const RUNS_WINDOW_DAYS = 30; // the runs payload reaches back this far (see the Runs table history timer)

const DEPLOY = <code>cdwr agent deploy --host agent-host</code>;

/** A `sha-abc1234` linked to its commit on GitHub */
const ShaLink = ({ sha }: { sha: string }) => (
  <a
    className="prn"
    href={GH_COMMIT + sha.slice(4)}
    target="_blank"
    rel="noopener noreferrer"
  >
    {sha}
  </a>
);

export const SessionBody = ({ m, state, now }: BodyProps) => {
  const s = m.session;
  const h = headline(m, state.details, now);
  return (
    <>
      <div className="group">
        <h3>Hosts</h3>
        {m.hostSessions.length ? (
          <ul className="knobs">
            {m.hostSessions.map((x) => (
              <li key={x.host}>
                <b>{x.host}</b>
                <span>{`${plural(x.sessions.length, 'session', 'sessions')} · ${[...new Set(x.sessions.map((y) => y.kind))].join(', ')} · newest heartbeat ${shortAge(x.ageMin)} ago`}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No live session on any host.</Empty>
        )}
      </div>
      <div className="group">
        <h3>Now</h3>
        <div className="verdict">
          <Parts parts={h.text} />
        </div>
        {h.note.length ? (
          <p className="rule">
            <Parts parts={h.note} />
          </p>
        ) : null}
      </div>
      {s ? (
        <div className="group">
          <h3>Heartbeat</h3>
          <dl className="kv">
            <dt>State</dt>
            <dd>
              {sessionLabel(s.state)}
              {s.detail ? ' · ' + s.detail : ''}
            </dd>
            <dt>Ticket</dt>
            <dd>{s.ticket ? <IdLink id={s.ticket} /> : 'none claimed'}</dd>
            <dt>Last seen</dt>
            <dd>
              {s.lastSeen
                ? new Date(s.lastSeen).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) +
                  ' · ' +
                  seenAgo(s.lastSeen, now)
                : '–'}
            </dd>
            {s.id ? (
              <>
                <dt>Session</dt>
                <dd>
                  <code>{s.id.slice(0, 8)}</code>
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : null}
      <div className="group">
        <h3>What the states mean</h3>
        <ul className="knobs">
          <li>
            <b>Live</b>
            <span>
              Hooks stamped the session recently. <i>working</i> runs tools,{' '}
              <i>polling</i> waits in <code>wait.sh</code> for the queue to
              change, which costs no turns.
            </span>
          </li>
          <li>
            <b>Stuck</b>
            <span>
              Polling for {STUCK_MIN} min or more while the queue has work for
              it: its wait missed the change. Type anything in its terminal.
            </span>
          </li>
          <li>
            <b>Waits on you</b>
            <span>
              A permission prompt or an idle prompt in the terminal. Nothing
              moves until you answer it.
            </span>
          </li>
          <li>
            <b>Stopped</b>
            <span>
              The session ended its turn or exited. With work waiting, the
              scheduler starts an implementing session on its next run.
            </span>
          </li>
          <li>
            <b>No session</b>
            <span>No work-queue session registered on this Mac.</span>
          </li>
        </ul>
      </div>
      <p className="rule">
        From the queue view the scheduler publishes on every run that changes
        it, so it is as fresh as the last run and stops while the Mac sleeps.{' '}
        <code>cdwr agent status</code> shows the same.
      </p>
    </>
  );
};

/** "Container · sha-9c7a20d" (the commit links to GitHub), "Mac · launchd", or nothing before the line says */
const HostName = ({ job }: { job: Job }) =>
  job.host ? (
    <>
      {hostName(job.host)}
      {job.rev ? (
        <>
          {' · '}
          <ShaLink sha={job.rev} />
        </>
      ) : null}
    </>
  ) : null;

/** What to do about scripts that differ from main: pull a newer image, or reinstall on the Mac */
const UpdateHint = ({ job }: { job: Job }) =>
  job.host === 'container' ? (
    <>run {DEPLOY}</>
  ) : (
    <>
      run <code>cdwr agent install</code>
    </>
  );

const JobText = ({ job }: { job: Job | null | undefined }) =>
  !job ? (
    <>
      Not reported yet. The installed run.sh predates the Job line: run{' '}
      <code>cdwr agent install</code>.
    </>
  ) : job.install === 'stale' ? (
    <>
      {job.line}. The {job.host === 'container' ? "image's" : 'installed'} copy
      differs from main{job.items ? ` (${job.items})` : ''}:{' '}
      <UpdateHint job={job} />.
    </>
  ) : job.install === 'unknown' ? (
    <>{job.line}. The scheduler couldn&apos;t read origin/main to compare.</>
  ) : (
    job.line
  );

export const SchedulerBody = ({ m }: Pick<BodyProps, 'm'>) => {
  if (!m.runs)
    return (
      <Empty>
        The runs haven&apos;t loaded yet. The scheduled planner records them in
        Supabase after every run.
      </Empty>
    );
  const last = m.runs.last;
  const job = m.runs.job;
  return (
    <>
      {last ? (
        <div className="group">
          <h3>Last run</h3>
          <div className={m.schedulerStale ? 'empty' : 'rule'}>
            {`${last.when} · ${last.outcome}`}
            {m.schedulerStale ? (
              <>
                . Nothing for {Math.floor(m.lastRunAge ?? 0)} hours: check that
                the Mac is awake, and <code>cdwr agent status</code> for a
                paused or unloaded job.
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="group">
        <h3>Job</h3>
        {job?.host ? (
          <dl className="kv">
            <dt>Runs on</dt>
            <dd>
              <HostName job={job} />
            </dd>
            {job.host === 'container' && !job.rev ? (
              <>
                <dt>Image</dt>
                <dd>
                  No commit on the Job line: a local build, or an image built
                  before it reported one. {DEPLOY} installs main&apos;s.
                </dd>
              </>
            ) : null}
          </dl>
        ) : null}
        <div className={!job || job.install === 'stale' ? 'empty' : 'rule'}>
          <JobText job={job} />
        </div>
        {m.imageBehind ? (
          <div className="empty">
            agent-host runs <ShaLink sha={m.imageBehind.runs} />, main has{' '}
            <ShaLink sha={m.imageBehind.main} />: run {DEPLOY}.
          </div>
        ) : null}
      </div>
      {m.deskBehind ? (
        <div className="group">
          <h3>Desk</h3>
          <div className="empty">
            This desk is <ShaLink sha={m.deskBehind.runs} />, main has{' '}
            <ShaLink sha={m.deskBehind.main} />:{' '}
            {m.web ? (
              <>run {DEPLOY} on the Mac, then reload this page</>
            ) : (
              <>
                run <code>cdwr agent desk install</code>
              </>
            )}
            .
          </div>
        </div>
      ) : null}
      <p className="rule">
        Idle runs update the last-run and job lines at most once an hour. The
        scheduler plans new tickets itself. For answers, reviews and parked work
        it starts an implementing session when none is alive (
        <code>launched</code>, then <code>implemented</code>, <code>cap</code>{' '}
        or <code>failed</code>). A problem is any outcome other than planned,
        idle, launched, implemented, suggested, nothing or skip, for example a
        failed run or one that planned nothing. It turns the Platform pill red
        until a later run goes well. The runs themselves are on the Runs today
        sheet. Full logs: <code>cdwr agent logs</code>.
      </p>
    </>
  );
};

export const RunsBody = ({ m }: Pick<BodyProps, 'm'>) => {
  if (!m.runs)
    return (
      <Empty>
        The runs haven&apos;t loaded yet. The scheduled planner records them in
        Supabase after every run.
      </Empty>
    );
  const t = m.runsToday;
  return (
    <>
      <div className="pv-stats">
        <div>
          <b>{t.count}</b>
          <span>runs today</span>
        </div>
        <div>
          <b>{t.medianMs === null ? '–' : shortAge(t.medianMs / 6e4)}</b>
          <span>median duration</span>
        </div>
        <div>
          <b>{t.failed}</b>
          <span>failed</span>
        </div>
      </div>
      <div className="group">
        <h3>{`Recent runs that did something, last ${RUNS_WINDOW_DAYS} days`}</h3>
        {m.runs.rows.length ? (
          <ul>
            {m.runs.rows.map((r, n) => (
              <li
                key={n}
                className={`item ${isProblem(r.outcome) ? 'blocked' : 'ready'}`}
              >
                <span className="rank"></span>
                <div className="main">
                  <div>
                    <b>{r.outcome}</b>
                    {r.ticket ? (
                      <>
                        {' '}
                        <IdLink id={r.ticket} />
                      </>
                    ) : null}
                  </div>
                  <div className="meta">
                    <Inline text={r.detail} />
                  </div>
                </div>
                <span className="side">{r.when}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>None yet.</Empty>
        )}
      </div>
      <p className="rule">
        The figures above count the runs that did something since local
        midnight; idle runs are left out of them and of the list. The list
        reaches back {RUNS_WINDOW_DAYS} days. A failed run is any outcome other
        than planned, idle, launched, implemented, suggested, nothing or skip.
      </p>
    </>
  );
};

type TimerRow = readonly [what: string, value: string, source: string];

// Kept by hand in step with run.sh, the work-queue skill and agent.logic.ts; only the interval is read live
const timerGroups = (m: Model): [string, TimerRow[]][] => {
  const min = m.runs?.job?.minutes;
  const assumed = min ? '' : ' (assumed: no Job line yet)';
  return [
    [
      'Scheduler (launchd, run.sh)',
      [
        [
          'Scheduled run',
          m.live
            ? `on events, fallback every ${m.runMinutes} min`
            : `every ${m.runMinutes} min`,
          `launchd StartInterval, from RUN_INTERVAL_SECONDS in agent.logic.ts (600 s). The live value comes from the Job line${assumed}`
        ],
        [
          'First run after install',
          'one interval later',
          'RunAtLoad is off; cdwr agent run starts one now'
        ],
        [
          'Next run',
          m.live
            ? `on events, fallback about ${m.nextRun ? hhmm(m.nextRun) : '?'}`
            : m.nextRun
              ? 'about ' + hhmm(m.nextRun)
              : 'unknown',
          'last run plus whole intervals; sleep shifts it'
        ],
        [
          'Runs table',
          'every run',
          'run.sh record_run, one row per run; a warn is a row of its own; the desk hides idle runs'
        ],
        [
          'Runs table history',
          '30 days, at most 500 runs',
          'the desk reads that window'
        ],
        [
          'Usage table',
          'at most once an hour',
          "run.sh record_usage runs `cdwr agent usage-record` from the planner's checkout"
        ],
        [
          'Activity table',
          'every run',
          "run.sh record_activity: 7 days, newest 200 events, from Linear's issue history via `cdwr agent activity`"
        ],
        [
          'Queue view',
          'every run',
          'run.sh, watch.jq `queue_view`; a change is written to queue_state at once'
        ],
        [
          'Daily suggestion',
          'first idle run after 06:00',
          'run.sh suggest_gate; AGENT_QUEUE_SUGGEST_DAYS between runs (0 switches it off), its own budget; an idea still waiting on you blocks the next'
        ],
        [
          'Implementing session',
          '$15 per run, $40 per day',
          'implement.sh `AGENT_QUEUE_IMPLEMENT_BUDGET_USD`, run.sh `AGENT_QUEUE_IMPLEMENT_CAP_USD`; two launches that change nothing stop it for that ticket'
        ],
        ['Linear API call', '20 s timeout', 'run.sh curl -m 20'],
        [
          'Offline check',
          '5 s, before any Linear call',
          'lib.sh `offline`: no network (a dark wake from sleep) skips the run without a record'
        ],
        [
          'Lock called stale',
          'after 10 min',
          'STALE_LOCK_MS in agent.logic.ts, read by cdwr agent status'
        ]
      ]
    ],
    [
      'PR watch (every run)',
      [
        [
          'agent:review tickets watched',
          'open, or closed ≤ 14 days',
          'run.sh WATCHED query'
        ]
      ]
    ],
    [
      'Attended /work-queue (skill)',
      [
        [
          'Session heartbeat',
          'every tool call',
          'hooks stamp the session file; Stop and SessionEnd mark it stopped'
        ],
        [
          'Claim take-over',
          'after 2 h',
          'only for a session that left no heartbeat'
        ],
        [
          'Copilot and CI waits',
          'parked, polled every 60 s',
          'wait.sh wakes the session when the wait resolves'
        ],
        [
          'Limit',
          'open agent PRs, default ' + LIMIT,
          'hand-offs no longer count; they show for 14 days after merge'
        ]
      ]
    ],
    [
      'This page',
      [
        [
          'Linear refresh',
          `every ${REFRESH_MS / MINUTE_MS} min`,
          'ticket lists, the runs, usage and activity tables; Refresh forces it'
        ],
        [
          'Activity called stale',
          `after ${ACTIVITY_STALE_MIN} min`,
          'its Updated line turns the warning colour'
        ],
        [
          'Ticket details',
          `cached ${DETAIL_STALE_MS / 1000} s`,
          'plan progress and Next lines in the sheets'
        ],
        [
          'Suggestions',
          `every ${REFRESH_MS / MINUTE_MS} min`,
          `agent-idea tickets of the last ${IDEA_WINDOW_DAYS} days; the discard word of a cancelled one is its last comment, cached ${REASON_STALE_MS / MINUTE_MS} min`
        ],
        [
          'Hand-off ticks',
          `with each refresh, cached ${HANDOFF_STALE_MS / 1000} s`,
          "read from the ticket's PR ready comment, ahead of the scheduler; a newly merged ticket still waits for its run"
        ],
        [
          'Session stuck',
          `polling ≥ ${STUCK_MIN} min with work queued`,
          "its last heartbeat to the queue view's time; the band turns red"
        ],
        [
          'Scheduler silent',
          `after ${m.staleHours} h`,
          "2 h, or twice the interval plus an hour when that's longer"
        ],
        ['Run problems', 'last 24 h', 'until a later run goes well'],
        [
          'Titles of closed tickets',
          `closed ≤ ${CLOSED_WINDOW_DAYS} days`,
          'CLOSED_WINDOW_DAYS in linear.ts'
        ]
      ]
    ]
  ];
};

export const TimersBody = ({ m }: Pick<BodyProps, 'm'>) => (
  <>
    {timerGroups(m).map(([h, rows]) => (
      <div className="group" key={h}>
        <h3>{h}</h3>
        <ul>
          {rows.map(([what, value, src]) => (
            <li className="item plain" key={what}>
              <span className="rank"></span>
              <div className="main">
                <div>
                  <b>{what}</b>
                </div>
                <div className="meta">
                  <Inline text={src} />
                </div>
              </div>
              <span className="side">{value}</span>
            </li>
          ))}
        </ul>
      </div>
    ))}
  </>
);

const WINDOW_TITLE = { five_hour: '5-hour window', seven_day: '7-day window' };

const PlanWindowFigure = ({ w, now }: { w: PlanWindow; now: Date }) => {
  const title = WINDOW_TITLE[w.kind];
  if (w.reset)
    return (
      <div className="fig">
        <div className="figh">
          <h3>{title}</h3>
          <b>–</b>
          <span>{`reset ${planWhen(w.resetsAt, now)}`}</span>
        </div>
        <Gauge share={0} bad={false} />
        <p className="rule">
          The window has reset. The next sample from an interactive session
          starts a new one.
        </p>
      </div>
    );
  const bad = w.verdict !== 'ok';
  const projection =
    w.verdict === 'bad'
      ? `Used up until ${planWhen(w.resetsAt, now)}`
      : w.verdict === 'warn' && w.runsOutAt
        ? `Runs out ~${planWhen(w.runsOutAt, now)}, before the ${planWhen(w.resetsAt, now)} reset`
        : `At this rate ${Math.round(w.projected)}% at reset`;
  return (
    <div className="fig">
      <div className="figh">
        <h3>{title}</h3>
        <b className={bad ? 'bad' : ''}>{`${Math.round(w.used)}%`}</b>
        <span>{`resets ${planWhen(w.resetsAt, now)}`}</span>
      </div>
      <Gauge share={w.used / 100} bad={bad} />
      <p className="rule">
        {`${projection}. `}
        <span className={w.stale ? 'stale' : ''}>
          {`Sample ${ageText(w.ageMin)}.`}
        </span>
      </p>
    </div>
  );
};

const PlanWindows = ({ m, state, now }: BodyProps) => {
  if (!state.data.planUsage)
    return (
      <Empty>
        {state.errors.has('planUsage')
          ? "The plan_usage table couldn't load from Supabase."
          : 'Loading the plan samples…'}
      </Empty>
    );
  const windows = [m.plan.five_hour, m.plan.seven_day].flatMap((w) =>
    w ? [w] : []
  );
  if (!windows.length)
    return (
      <Empty>
        No plan sample yet. Run <code>cdwr agent statusline install</code> on
        the Mac, then use an interactive session.
      </Empty>
    );
  return (
    <div className="figs">
      {windows.map((w) => (
        <PlanWindowFigure key={w.kind} w={w} now={now} />
      ))}
    </div>
  );
};

const PlanBurn = ({ m, state }: Pick<BodyProps, 'm' | 'state'>) => {
  if (!state.data.usageHours)
    return (
      <Empty>
        {state.errors.has('usageHours')
          ? "The usage_hours table couldn't load from Supabase."
          : 'Loading the hourly usage…'}
      </Empty>
    );
  if (!state.data.usageHours.length)
    return (
      <Empty>
        No hourly usage yet. The hosts write the <code>usage_hours</code> table
        as their sessions run.
      </Empty>
    );
  const { hourly, fiveHour, sevenDay } = m.burn;
  const day = hourly.reduce((n, h) => n + h.cost, 0);
  const peak = Math.max(0, ...hourly.map((h) => h.cost));
  const max = Math.max(1, peak); // the chart's scale keeps a floor of 1
  return (
    <>
      <div className="fig">
        <div className="figh">
          <h3>Last 24 hours</h3>
          <b>{usd(day, 2)}</b>
          <span>{`per hour, peak ${usd(peak, 2)}`}</span>
        </div>
        <Sparkline
          points={hourly.map((h) => ({ at: h.hour, value: h.cost }))}
          from={hourly[0].hour}
          to={hourly[hourly.length - 1].hour}
          max={max}
          limit={null}
          label="API-equivalent dollars per hour, last 24 hours"
        />
      </div>
      <Table
        head={['Role', '5-hour window', '7 days']}
        rows={[...BURN_ROLES, 'total' as const].map((r) => [
          r,
          usd(fiveHour[r], 2),
          usd(sevenDay[r], 2)
        ])}
      />
    </>
  );
};

export const PlanBody = ({ m, state, now }: BodyProps) => (
  <>
    <PlanWindows m={m} state={state} now={now} />
    <PlanBurn m={m} state={state} />
    <p className="rule">
      Hourly figures are API-equivalent dollars across every Claude project on
      the hosts, a proxy for what the plan counts. The percentages come from
      Claude Code&apos;s status line on an interactive session, so they age
      while only the NUC runs.
    </p>
  </>
);
