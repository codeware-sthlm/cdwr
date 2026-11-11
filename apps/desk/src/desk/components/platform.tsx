import type { ReactNode } from 'react';

import { SESSION_ATTENDED_MIN, SESSION_HANDBACK_MIN } from '../constants';
import { ageText, hhmm, plural, runTime, shortAge, usd } from '../format';
import { type HandBackState, type HealthCheck, problemOf } from '../live';
import type { Model, VersionState } from '../model';
import { CAP_RANGE, LIMIT_RANGE } from '../render/controls';
import { platform } from '../render/header';
import { problemId } from '../render/problems';

import { STEPS, percent } from './capacity';
import { CmdButton, ControlStatus, Stepper } from './controls';

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

const Chip = ({ text, tone }: { text: string; tone: Tone }) => (
  <span className={`pf-chip ${tone}`}>{text}</span>
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
  <section className="card-top pf-card">
    <div className="ct-head">
      <h2 className="cap-label">{label}</h2>
      {src ? <span className="cap-src">{src}</span> : null}
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
  <div className="pf-row">
    <div className="pf-main">
      <b>{title}</b>
      <span className="pf-line">{line}</span>
      {actions ? <span className="pf-btns">{actions}</span> : null}
    </div>
    <b className={`pf-val ${tone}`}>{value}</b>
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
    <div className="pf-row">
      <div className="pf-main">
        <b>Scheduler</b>
        <span className="pf-line">{last}</span>
        <span className="pf-btns">
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
              className="pf-mini"
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
      <b className="pf-val">{value}</b>
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
      <div className="pf-rows">
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
      <p className="pf-foot">
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
    <div className="pf-box mac">
      <div className="cap-hh">
        <i className="cap-dot mac" aria-hidden="true"></i>
        <b className="cap-name">{h.host}</b>
        {attended ? (
          <span className="pf-chip work on">ATTENDED</span>
        ) : (
          <span className="pf-chip muted">{h.state.toUpperCase()}</span>
        )}
      </div>
      {text ? <p className="cap-sub">{text}</p> : null}
      <div
        className="pf-strip"
        role="img"
        aria-label={`Hand-back to the NUC: ${h.state}, one of ${STEPS.join(', ')}`}
      >
        {STEPS.map((s) => (
          <span key={s} className={s === h.state ? 'on' : ''}>
            <i></i>
            <b>{STEP_RULE[s].label}</b>
            <small>{STEP_RULE[s].sub}</small>
          </span>
        ))}
      </div>
      <p className="pf-rule">
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
      <div className="pf-box">
        <div className="cap-hh">
          <i className="cap-dot stale" aria-hidden="true"></i>
          <b className="cap-name">nuc</b>
        </div>
        <p className="cap-sub">no samples yet</p>
      </div>
    );
  const v =
    VERDICT[n.verdict === 'ok' ? (n.busy ? 'busy' : 'idle') : n.verdict];
  return (
    <div className="pf-box">
      <div className="cap-hh">
        <i className={`cap-dot ${n.verdict}`} aria-hidden="true"></i>
        <b className="cap-name">{n.host}</b>
        <Chip text={v.text} tone={v.tone} />
      </div>
      <p className="cap-sub">
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
      <h3 className="pf-sub">mac today</h3>
      {m.macToday.length || attended ? (
        <div className="pf-times">
          {m.macToday.map((e, i) => [
            <span key={`t${i}`} className="pf-t">
              {hhmm(e.lastSeen)}
            </span>,
            <span key={`k${i}`}>{e.kind} session · last seen</span>
          ])}
          {attended ? (
            <>
              <span className="pf-t">now</span>
              <span>attended</span>
            </>
          ) : null}
        </div>
      ) : (
        <p className="cap-sub">no sessions today</p>
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
    <div className="pf-row">
      <div className="pf-main">
        <b>{title}</b>
        {extra ? <span className="pf-line">{extra}</span> : null}
      </div>
      <div className="pf-ver">
        <Chip text={text} tone={tone} />
        <code className="pf-mono">{mono}</code>
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
    <div className="pf-row">
      <div className="pf-main">
        <b>Scheduler scripts</b>
      </div>
      <div className="pf-ver">
        <Chip text={chipText} tone={tone} />
        <span className="pf-mono">{line}</span>
      </div>
    </div>
  );
};

const Versions = ({ m }: { m: Model }) => (
  <Section label="VERSIONS & UPDATES">
    <div className="pf-rows">
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
  if (!problem) return <small className="pf-why">{text}</small>;
  const id = problemId(problem);
  return (
    <small className="pf-why">
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
      <div className="pf-health">
        {m.health.map((c) => [
          <i
            key={`d-${c.name}`}
            className={`cap-dot ${c.ok ? '' : 'bad'}`}
            aria-hidden="true"
          ></i>,
          <span key={`n-${c.name}`} className="pf-hname">
            <span>{c.name}</span>
            {c.ok ? (
              c.note ? (
                <small className="pf-note">{c.note}</small>
              ) : null
            ) : (
              <Why m={m} c={c} onProblem={onProblem} />
            )}
          </span>,
          <code key={`a-${c.name}`} className="pf-mono">
            {c.at === null ? 'never' : ageText((now.getTime() - c.at) / 6e4)}
          </code>
        ])}
      </div>
    ) : (
      <p className="cap-sub">no checks yet</p>
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
      <div className="pf-head">
        <button
          type="button"
          className="pf-back"
          data-view="desk"
          onClick={actions.desk}
        >
          ‹ Desk
        </button>
        <div className="pf-title">
          <h1 id="platform-title" tabIndex={-1}>
            Platform
          </h1>
          <span className="cap-sub">
            hosts, versions and health
            {m.controls
              ? ''
              : ' — read-only; controls need a control token in Settings'}
          </span>
        </div>
        <div className="pf-stats">
          {!m.runs ? (
            <span className="pf-stat">checks –</span>
          ) : p.failing.length ? (
            <span className="pf-stat bad">{p.failing.length} failing</span>
          ) : (
            <span className="pf-stat ok">
              {ok} of {m.health.length} checks ok
            </span>
          )}
          {p.updates ? (
            <span className="pf-stat wait">
              {plural(p.updates, 'update', 'updates')}
            </span>
          ) : null}
        </div>
      </div>
      <div className="pf-grid">
        <Controls m={m} a={actions} />
        <Hosts m={m} />
        <Versions m={m} />
        <HealthChecks m={m} now={now} onProblem={actions.problem} />
      </div>
    </>
  );
};
