import type { ReactNode } from 'react';

import { SESSION_ATTENDED_MIN, SESSION_HANDBACK_MIN } from '../constants';
import { ageText, hhmm, plural, runTime, shortAge, usd } from '../format';
import {
  type HandBackState,
  type HealthCheck,
  problemId,
  problemOf
} from '../live';
import type { Model, VersionState } from '../model';
import { CAP_RANGE, LIMIT_RANGE } from '../view/controls';
import { platform } from '../view/header';

import {
  CAP_HH,
  CAP_LABEL,
  CAP_NAME,
  CAP_SRC,
  CAP_SUB,
  STEPS,
  capDot,
  percent
} from './capacity';
import { CmdButton, ControlStatus, MINI, Stepper } from './controls';

// The Platform view: hosts, versions and health, with the queue's controls when the desk has a
// control token. It fills `#platform` in place of the desk's cards, and handles its own clicks.

/** What the view's buttons do */
export type PlatformActions = {
  /** Back to the desk */
  desk: () => void;
  /** A failing check's link to the problem card that explains it */
  problem: (id: string) => void;
  /** The scheduler row's sheets */
  sheet: (id: string) => void;
  pause: (kind: 'pause' | 'resume') => void;
  run: () => void;
  step: (control: 'limit' | 'cap', delta: number) => void;
  apply: (control: 'limit' | 'cap') => void;
};

type Tone = 'ok' | 'wait' | 'bad' | 'muted' | 'work';

const MUTED = 'text-[color:var(--muted)]';
const MONO = 'font-[family-name:var(--font-mono)] leading-[normal]';
const ROW =
  'pf-row flex items-start justify-between gap-4 border-t border-[color:var(--line)] py-3 first:border-t-0 first:pt-0';
const MAIN = 'pf-main flex min-w-0 flex-col gap-0.5 text-[13px]';
const PF_T = `pf-t ${MONO} text-[12px] font-medium text-[color:var(--fg)]`;
const VER =
  'pf-ver flex min-w-0 flex-wrap items-center justify-end gap-x-2.5 gap-y-1';
const BTNS = 'pf-btns mt-1.5 flex flex-wrap gap-1.5';
const LINE = `pf-line text-[12px] ${MUTED}`;
const VAL = `pf-val flex-none ${MONO} text-[13px] font-semibold tabular-nums`;
const MONO_TEXT = `pf-mono ${MONO} bg-transparent p-0 text-[12px] font-normal [overflow-wrap:anywhere] ${MUTED}`;
const BOX =
  'pf-box flex flex-col gap-2 rounded-[var(--r-row)] border px-4 py-3.5';
const BOX_PLAIN = `${BOX} border-[color:var(--line)] bg-[color:var(--sunk)]`;
const BOX_MAC = `${BOX} mac border-[color:var(--work-soft)] bg-[color:var(--work-soft)]`;

const CHIP: Record<string, string> = {
  ok: 'bg-[color:var(--ok-soft)] text-[color:var(--ok)]',
  wait: 'bg-[color:var(--wait-soft)] text-[color:var(--wait)]',
  bad: 'bg-[color:var(--block-soft)] text-[color:var(--block)]',
  muted: 'bg-[color:var(--sunk)] text-[color:var(--muted)]',
  work: 'bg-[color:var(--work-soft)] text-[color:var(--attended)]',
  'work on': 'bg-[color:var(--attended)] text-[color:var(--bg)]'
};

/** A chip's classes; `tone` may carry `on` after `work` */
const chip = (tone: string): string =>
  `pf-chip ${tone} ${MONO} rounded-[var(--r-pill)] px-2 py-px text-[10px] font-medium tracking-[0.1em] whitespace-nowrap ${CHIP[tone]}`;

const Chip = ({ text, tone }: { text: string; tone: Tone }) => (
  <span className={chip(tone)}>{text}</span>
);

const Section = ({
  label,
  src,
  children
}: {
  label: string;
  src?: string;
  children: ReactNode;
}) => (
  <section className="card-top pf-card cursor-default gap-[14px]">
    <div className="ct-head">
      <h2 className={`cap-label ${CAP_LABEL}`}>{label}</h2>
      {src ? <span className={`cap-src ${CAP_SRC}`}>{src}</span> : null}
    </div>
    {children}
  </section>
);

// ---------- Controls ----------

const ControlRow = ({
  title,
  line,
  value,
  tone = '',
  actions
}: {
  title: string;
  line: string;
  value: string;
  tone?: string;
  actions?: ReactNode;
}) => (
  <div className={ROW}>
    <div className={MAIN}>
      <b>{title}</b>
      <span className={LINE}>{line}</span>
      {actions ? <span className={BTNS}>{actions}</span> : null}
    </div>
    <b
      className={`${VAL} ${tone} ${tone === 'wait' ? 'text-[color:var(--wait)]' : ''}`}
    >
      {value}
    </b>
  </div>
);

const SCHEDULER_SHEETS = [
  ['scheduler', 'details'],
  ['timers', 'timers'],
  ['runs', 'runs']
] as const;

const SchedulerRow = ({ m, a }: { m: Model; a: PlatformActions }) => {
  const last = m.runs?.last
    ? `last run ${hhmm(runTime(m.runs.last.when))}`
    : 'no run yet';
  const value = m.live ? 'on events' : m.nextRun ? `~${hhmm(m.nextRun)}` : '–';
  const c = m.controls;
  return (
    <div className={ROW}>
      <div className={MAIN}>
        <b>Scheduler</b>
        <span className={LINE}>{last}</span>
        <span className={BTNS}>
          {c ? (
            <CmdButton
              cmd="run"
              label="Run now"
              view={c.states.run}
              onClick={a.run}
            />
          ) : null}
          {SCHEDULER_SHEETS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`pf-mini ${MINI}`}
              data-w={id}
              aria-haspopup="dialog"
              onClick={() => a.sheet(id)}
            >
              {label}
            </button>
          ))}
        </span>
        {c ? <ControlStatus view={c.states.run} /> : null}
      </div>
      <b className={VAL}>{value}</b>
    </div>
  );
};

const Controls = ({ m, a }: { m: Model; a: PlatformActions }) => {
  const loaded = m.runs !== null;
  const { used, max } = m.limits.prs;
  const e = m.limits.effort;
  const queue = !loaded ? '–' : m.limits.paused ? 'Paused' : 'Running';
  const c = m.controls;
  return (
    <Section label="CONTROLS" src={c ? '' : 'read-only'}>
      <div className="pf-rows flex flex-col">
        <ControlRow
          title="Queue"
          line={
            c
              ? 'pause stops the scheduler launching work'
              : 'cdwr agent pause · cdwr agent resume'
          }
          value={queue}
          tone={m.limits.paused ? 'wait' : ''}
          actions={
            c ? (
              <>
                <CmdButton
                  cmd={c.paused ? 'resume' : 'pause'}
                  label={c.paused ? 'Resume' : 'Pause'}
                  view={c.states.pause}
                  onClick={() => a.pause(c.paused ? 'resume' : 'pause')}
                />
                <ControlStatus view={c.states.pause} />
              </>
            ) : null
          }
        />
        <ControlRow
          title="Agent PRs in flight"
          line={`${used} open now${c ? '' : ' · set per session with /work-queue limit=N'}`}
          value={loaded ? String(max) : '–'}
          actions={
            c ? (
              <Stepper
                control="limit"
                range={LIMIT_RANGE}
                current={c.limit.current}
                draft={c.limit.draft}
                view={c.states.limit}
                fmt={String}
                onStep={(delta) => a.step('limit', delta)}
                onApply={() => a.apply('limit')}
              />
            ) : null
          }
        />
        <ControlRow
          title="Daily effort cap"
          line={`${e ? percent(e.share) : '–'} used today${c ? '' : ' · AGENT_QUEUE_IMPLEMENT_CAP_USD on the host'}`}
          value={e ? usd(e.cap) : '–'}
          actions={
            c ? (
              <Stepper
                control="cap"
                range={CAP_RANGE}
                current={c.cap.current}
                draft={c.cap.draft}
                view={c.states.cap}
                fmt={usd}
                onStep={(delta) => a.step('cap', delta)}
                onApply={() => a.apply('cap')}
              />
            ) : null
          }
        />
        <SchedulerRow m={m} a={a} />
      </div>
      <p className={`pf-foot text-[12px] ${MUTED}`}>
        {c
          ? `Commands go to ${c.host}, which applies them at its next tick.`
          : 'Read-only here: add a control token in Settings to steer from the desk. The CLI steers the queue meanwhile.'}
      </p>
    </Section>
  );
};

// ---------- Hosts & heartbeat ----------

const STEP_RULE: Record<HandBackState, { label: string; sub: string }> = {
  attended: {
    label: 'attended',
    sub: `heartbeat within ${SESSION_ATTENDED_MIN} min`
  },
  'handing back': {
    label: 'handing back',
    sub: `no heartbeat for ${SESSION_ATTENDED_MIN}–${SESSION_HANDBACK_MIN} min`
  },
  'handed back': {
    label: 'handed back',
    sub: 'the NUC has the queue and sampled within its silent limit'
  },
  idle: { label: 'idle', sub: 'the NUC is silent too; queue may schedule' }
};

const MacPanel = ({ m }: { m: Model }) => {
  const h = m.handBack;
  if (!h.host) return null;
  const attended = h.state === 'attended';
  const ticket = attended ? m.session?.ticket : undefined;
  const text =
    attended && ticket
      ? `you are on ${ticket} · the queue schedules nothing here`
      : h.ageMin === null
        ? ''
        : `seen ${shortAge(h.ageMin)} ago`;
  return (
    <div className={BOX_MAC}>
      <div className={`cap-hh ${CAP_HH}`}>
        <i className={capDot('mac')} aria-hidden="true"></i>
        <b className={`cap-name ${CAP_NAME}`}>{h.host}</b>
        {attended ? (
          <span className={chip('work on')}>ATTENDED</span>
        ) : (
          <span className={chip('muted')}>{h.state.toUpperCase()}</span>
        )}
      </div>
      {text ? <p className={`cap-sub ${CAP_SUB}`}>{text}</p> : null}
      <div
        className="pf-strip mt-1 flex gap-2 max-[600px]:flex-wrap"
        role="img"
        aria-label={`Hand-back to the NUC: ${h.state}, one of ${STEPS.join(', ')}`}
      >
        {STEPS.map((s) => (
          <span
            key={s}
            className={`${s === h.state ? 'on text-[color:var(--attended)]' : 'text-[color:var(--faint)]'} flex min-w-0 flex-[1_1_0] flex-col gap-1 max-[600px]:basis-[calc(50%-4px)]`}
          >
            <i
              className={`block h-[5px] rounded-[var(--r-pill)] ${s === h.state ? 'bg-[color:var(--attended)]' : 'bg-[color:var(--line-strong)]'}`}
            ></i>
            <b className="text-[12px]">{STEP_RULE[s].label}</b>
            <small className="text-[11px] text-[color:var(--faint)]">
              {STEP_RULE[s].sub}
            </small>
          </span>
        ))}
      </div>
      <p className={`pf-rule text-[11px] ${MUTED}`}>
        Computed from sessions alone: the Mac's newest attended heartbeat within{' '}
        {SESSION_ATTENDED_MIN} min is attended, within {SESSION_HANDBACK_MIN}{' '}
        min it is handing back; after that the NUC's heartbeat decides between
        handed back and idle. An ended session drops at once.
      </p>
    </div>
  );
};

const VERDICT: Record<string, { text: string; tone: Tone }> = {
  idle: { text: 'IDLE', tone: 'ok' },
  busy: { text: 'BUSY', tone: 'ok' },
  stale: { text: 'STALE', tone: 'muted' },
  bad: { text: 'BAD', tone: 'bad' }
};

const NucRow = ({ m }: { m: Model }) => {
  const n = m.nuc;
  const host = m.host;
  if (!n || !host)
    return (
      <div className={BOX_PLAIN}>
        <div className={`cap-hh ${CAP_HH}`}>
          <i className={capDot('stale')} aria-hidden="true"></i>
          <b className={`cap-name ${CAP_NAME}`}>nuc</b>
        </div>
        <p className={`cap-sub ${CAP_SUB}`}>no samples yet</p>
      </div>
    );
  const v =
    VERDICT[n.verdict === 'ok' ? (n.busy ? 'busy' : 'idle') : n.verdict];
  return (
    <div className={BOX_PLAIN}>
      <div className={`cap-hh ${CAP_HH}`}>
        <i className={capDot(n.verdict)} aria-hidden="true"></i>
        <b className={`cap-name ${CAP_NAME}`}>{n.host}</b>
        <Chip text={v.text} tone={v.tone} />
      </div>
      <p className={`cap-sub ${CAP_SUB}`}>
        {`heartbeat ${shortAge(n.ageMin)} ago · every ${Math.round(host.intervalMin)} min · CPU ${percent(n.cpu)}`}
      </p>
    </div>
  );
};

const MacToday = ({ m }: { m: Model }) => {
  if (!m.handBack.host && !m.macToday.length) return null;
  const attended = m.handBack.state === 'attended';
  return (
    <div className="pf-today">
      <h3
        className={`pf-sub mb-1.5 ${MONO} text-[11px] font-medium tracking-[0.12em] uppercase ${MUTED}`}
      >
        mac today
      </h3>
      {m.macToday.length || attended ? (
        <div
          className={`pf-times grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1 text-[12px] ${MUTED}`}
        >
          {m.macToday.map((e, i) => [
            <span key={`t${i}`} className={PF_T}>
              {hhmm(e.lastSeen)}
            </span>,
            <span key={`k${i}`}>{e.kind} session · last seen</span>
          ])}
          {attended ? (
            <>
              <span className={PF_T}>now</span>
              <span>attended</span>
            </>
          ) : null}
        </div>
      ) : (
        <p className={`cap-sub ${CAP_SUB}`}>no sessions today</p>
      )}
    </div>
  );
};

const Hosts = ({ m }: { m: Model }) => (
  <Section label="HOSTS & HEARTBEAT" src="sessions + host_metrics">
    <MacPanel m={m} />
    <NucRow m={m} />
    <MacToday m={m} />
  </Section>
);

// ---------- Versions ----------

const VersionRow = ({
  title,
  v,
  behindText,
  extra = ''
}: {
  title: string;
  v: VersionState;
  behindText: string;
  extra?: string;
}) => {
  const [text, tone, mono]: [string, Tone, string] =
    v.state === 'behind'
      ? [behindText, 'wait', `${v.runs} → ${v.main}`]
      : v.state === 'current'
        ? ['up to date', 'ok', v.runs ?? '–']
        : ['unknown', 'muted', v.runs ?? '–'];
  return (
    <div className={ROW}>
      <div className={MAIN}>
        <b>{title}</b>
        {extra ? <span className={LINE}>{extra}</span> : null}
      </div>
      <div className={VER}>
        <Chip text={text} tone={tone} />
        <code className={MONO_TEXT}>{mono}</code>
      </div>
    </div>
  );
};

const InstallRow = ({ m }: { m: Model }) => {
  const install = m.versions.install;
  const items = m.runs?.job?.items ?? '';
  const [chipText, tone, line]: [string, Tone, string] =
    install === 'current'
      ? ['current', 'ok', 'matches main']
      : install === 'stale'
        ? ['stale', 'wait', `out of date${items ? ` (${items})` : ''}`]
        : ['unknown', 'muted', 'unknown'];
  return (
    <div className={ROW}>
      <div className={MAIN}>
        <b>Scheduler scripts</b>
      </div>
      <div className={VER}>
        <Chip text={chipText} tone={tone} />
        <span className={MONO_TEXT}>{line}</span>
      </div>
    </div>
  );
};

const Versions = ({ m }: { m: Model }) => (
  <Section label="VERSIONS & UPDATES">
    <div className="pf-rows flex flex-col">
      <VersionRow
        title="nuc image"
        v={m.versions.image}
        behindText="update available"
      />
      <VersionRow
        title="This desk"
        v={m.versions.desk}
        behindText="out of date"
        extra={
          m.versions.desk.state === 'behind'
            ? m.web
              ? 'cdwr agent deploy, then reload'
              : 'cdwr agent desk install'
            : ''
        }
      />
      <InstallRow m={m} />
    </div>
  </Section>
);

// ---------- Health ----------

const STAT = `${MONO} text-[12px] font-medium`;
const WHY = 'pf-why text-[11px] text-[color:var(--block)]';

/** A failing row links to the problem card that explains it */
const Why = ({
  m,
  c,
  onProblem
}: {
  m: Model;
  c: HealthCheck;
  onProblem: (id: string) => void;
}) => {
  const problem = problemOf(m.problems, c.name);
  const text = problem?.text || c.note || 'failing';
  if (!problem) return <small className={WHY}>{text}</small>;
  const id = problemId(problem);
  return (
    <small className={WHY}>
      <button
        type="button"
        className="pf-problem"
        data-problem={id}
        onClick={() => onProblem(id)}
      >
        {text}
      </button>
    </small>
  );
};

const HealthChecks = ({
  m,
  now,
  onProblem
}: {
  m: Model;
  now: Date;
  onProblem: (id: string) => void;
}) => (
  <Section label="HEALTH CHECKS">
    {m.health.length ? (
      <div className="pf-health grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2.5 text-[13px]">
        {m.health.map((c) => [
          <i
            key={`d-${c.name}`}
            className={`${capDot(c.ok ? '' : 'bad')} mt-1.5`}
            aria-hidden="true"
          ></i>,
          <span key={`n-${c.name}`} className="pf-hname flex min-w-0 flex-col">
            <span>{c.name}</span>
            {c.ok ? (
              c.note ? (
                <small className={`pf-note text-[11px] ${MUTED}`}>
                  {c.note}
                </small>
              ) : null
            ) : (
              <Why m={m} c={c} onProblem={onProblem} />
            )}
          </span>,
          <code
            key={`a-${c.name}`}
            className={`${MONO_TEXT} text-right whitespace-nowrap`}
          >
            {c.at === null ? 'never' : ageText((now.getTime() - c.at) / 6e4)}
          </code>
        ])}
      </div>
    ) : (
      <p className={`cap-sub ${CAP_SUB}`}>no checks yet</p>
    )}
  </Section>
);

// ---------- The view ----------

type Props = { m: Model; now: Date; actions: PlatformActions };

export const Platform = ({ m, now, actions }: Props) => {
  const p = platform(m);
  const ok = m.health.filter((c) => c.ok).length;
  return (
    <>
      <div className="pf-head flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          className="pf-back min-h-[var(--tap)] px-3.5"
          data-view="desk"
          onClick={actions.desk}
        >
          ‹ Desk
        </button>
        <div className="pf-title mr-auto flex min-w-0 flex-col gap-0.5">
          <h1
            id="platform-title"
            tabIndex={-1}
            className="font-[family-name:var(--font-ui)] text-[22px] leading-[1.2] font-semibold tracking-[0.18em] uppercase focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--accent)]"
          >
            Platform
          </h1>
          <span className={`cap-sub ${CAP_SUB}`}>
            hosts, versions and health
            {m.controls
              ? ''
              : ' — read-only; controls need a control token in Settings'}
          </span>
        </div>
        <div className="pf-stats flex flex-wrap gap-2">
          {!m.runs ? (
            <span className={`pf-stat ${STAT} ${MUTED}`}>checks –</span>
          ) : p.failing.length ? (
            <span className={`pf-stat bad ${STAT} text-[color:var(--block)]`}>
              {p.failing.length} failing
            </span>
          ) : (
            <span className={`pf-stat ok ${STAT} text-[color:var(--ok)]`}>
              {ok} of {m.health.length} checks ok
            </span>
          )}
          {p.updates ? (
            <span className={`pf-stat wait ${STAT} text-[color:var(--wait)]`}>
              {plural(p.updates, 'update', 'updates')}
            </span>
          ) : null}
        </div>
      </div>
      <div className="pf-grid grid grid-cols-[repeat(auto-fit,minmax(min(580px,100%),1fr))] items-start gap-4">
        <Controls m={m} a={actions} />
        <Hosts m={m} />
        <Versions m={m} />
        <HealthChecks m={m} now={now} onProblem={actions.problem} />
      </div>
    </>
  );
};
