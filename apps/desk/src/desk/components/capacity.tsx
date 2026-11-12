import {
  HOST_DISK_FREE_MIN,
  HOST_LOAD_PER_CORE_MAX,
  HOST_MEM_USED_MAX,
  LIMIT
} from '../constants';
import { hhmm, plural, shortAge, usd } from '../format';
import type { HandBackState } from '../live';
import type { Model } from '../model';

import { FRAME, HEAD, PANEL } from './card-ui';
import { CpuChart } from './charts';
import { CmdButton, ControlStatus, MINI } from './controls';

// The Capacity row between the cards and the tiles: limits and hosts on the desktop, one card on a phone

export type Tone = 'neutral' | 'ok' | 'wait' | 'bad';

/** The agent PR limit with room for one more is already amber */
const prsTone = (used: number, max: number): Tone =>
  used >= max - 1 ? 'wait' : 'neutral';

const effortTone = (share: number): Tone =>
  share >= 1 ? 'bad' : share >= 0.8 ? 'wait' : 'ok';

export const percent = (share: number): string => `${Math.round(share * 100)}%`;

/** The bar's fill, capped at the track */
const fill = (share: number): number => Math.max(0, Math.min(1, share)) * 100;

export const STEPS: readonly HandBackState[] = [
  'attended',
  'handing back',
  'handed back',
  'idle'
];

/** What the row's buttons do */
type Props = {
  m: Model;
  onSheet: (id: string) => void;
  onView: (view: 'platform') => void;
  pause: (kind: 'pause' | 'resume') => void;
  run: () => void;
};

const MUTED = 'text-[color:var(--muted)]';
const MONO = 'font-[family-name:var(--font-mono)] leading-[normal]';

// Shared with the Platform view, which draws the same host heads
export const CAP_LABEL = `${MONO} text-[11px] font-medium tracking-[0.12em] uppercase ${MUTED}`;
export const CAP_HH = 'flex min-w-0 items-center gap-2';
export const CAP_NAME = `${MONO} text-[13px] font-semibold`;
export const CAP_SUB = `text-[12px] ${MUTED}`;
export const CAP_SRC = `${MONO} inline-flex items-center gap-3 text-[11px] font-normal ${MUTED}`;

const DOT: Record<string, string> = {
  bad: 'bg-[color:var(--block)]',
  stale: 'bg-[color:var(--faint)]',
  mac: 'bg-[color:var(--attended)]'
};

/** The host dot's classes; `kind` is a verdict or `mac`, anything else is the healthy green */
export const capDot = (kind: string): string =>
  `cap-dot${kind ? ` ${kind}` : ''} size-2 flex-none rounded-[var(--r-pill)] ${DOT[kind] ?? 'bg-[color:var(--ok)]'}`;

const FILL: Record<Tone, string> = {
  neutral: 'bg-[color:var(--bar)]',
  ok: 'bg-[color:var(--ok)]',
  wait: 'bg-[color:var(--wait)]',
  bad: 'bg-[color:var(--block)]'
};

/** A meter's value takes the amber or red of its tone */
const VALUE: Record<Tone, string> = {
  neutral: '',
  ok: '',
  wait: 'text-[color:var(--wait)]',
  bad: 'text-[color:var(--block)]'
};

const CV = `cap-v ${MONO} text-[13px] font-semibold tabular-nums`;
const METER = 'flex min-w-0 flex-col gap-1.5';
const NOTE = `cap-note text-[11px] empty:hidden ${MUTED}`;
const HOST = 'cap-host flex min-w-0 flex-col gap-2';
const MH = 'cap-mh flex items-baseline justify-between gap-3';

const Bar = ({
  share,
  tone,
  px = 6
}: {
  share: number;
  tone: Tone;
  px?: number;
}) => (
  <span
    className="cap-bar block min-w-0 overflow-hidden rounded-[var(--r-pill)] bg-[color:var(--sunk)]"
    style={{ height: px }}
    aria-hidden="true"
  >
    <i
      className={`${tone} block h-full rounded-[var(--r-pill)] ${FILL[tone]}`}
      style={{ width: `${fill(share).toFixed(1)}%` }}
    ></i>
  </span>
);

const PrsMeter = ({
  m,
  onSheet
}: {
  m: Model;
  onSheet: (id: string) => void;
}) => {
  const loaded = m.runs !== null;
  const { used } = m.limits.prs;
  const max = m.limits.prs.max || LIMIT;
  const tone = loaded ? prsTone(used, max) : 'neutral';
  const note = !loaded
    ? ''
    : used >= max
      ? 'no slot free'
      : `${plural(max - used, 'slot', 'slots')} free · merges free a slot live`;
  return (
    <button
      type="button"
      className={`cap-meter cap-btn ${tone} ${METER} box-border cursor-pointer rounded-[var(--r-row)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--accent)]`}
      data-w="limit"
      aria-haspopup="dialog"
      onClick={() => onSheet('limit')}
    >
      <span className={`${MH} text-[13px]`}>
        <span>Agent PRs in flight</span>
        <b className={`${CV} ${VALUE[tone]}`}>
          {loaded ? `${used} / ${max}` : '–'}
        </b>
      </span>
      <Bar share={loaded ? used / max : 0} tone={tone} />
      <span className={NOTE}>{note}</span>
    </button>
  );
};

const EffortMeter = ({ m }: { m: Model }) => {
  const e = m.limits.effort;
  const tone = e ? effortTone(e.share) : 'ok';
  const note =
    m.runs === null
      ? ''
      : e
        ? `${usd(e.spent)} of the ${usd(e.cap)} cap · simulated, nothing billed · resets 00:00`
        : 'not published yet: the scheduler sends it after its next deploy';
  return (
    <div className={`cap-meter ${tone} ${METER}`}>
      <span className={`${MH} text-[13px]`}>
        <span>Agent effort today</span>
        <b className={`${CV} ${VALUE[tone]}`}>{e ? percent(e.share) : '–'}</b>
      </span>
      <Bar share={e ? e.share : 0} tone={tone} />
      <span className={NOTE}>{note}</span>
    </div>
  );
};

const queueTone = (paused: boolean): string =>
  `text-[12px] ${paused ? 'text-[color:var(--wait)]' : MUTED}`;

const Queue = ({
  m,
  pause
}: {
  m: Model;
  pause: (kind: 'pause' | 'resume') => void;
}) => {
  if (m.runs === null) return null;
  const c = m.controls;
  const paused = m.limits.paused;
  const word = paused ? 'Queue paused' : 'Queue running';
  if (c) {
    const kind = paused ? 'resume' : 'pause';
    return (
      <p className={`cap-queue ${paused ? 'wait' : ''} ${queueTone(paused)}`}>
        {word}{' '}
        <CmdButton
          cmd={kind}
          label={paused ? 'Resume' : 'Pause'}
          view={c.states.pause}
          onClick={() => pause(kind)}
          className={`pf-mini ${MINI} mx-1.5`}
        />
        <ControlStatus view={c.states.pause} />
      </p>
    );
  }
  return paused ? (
    <p className={`cap-queue wait ${queueTone(true)}`}>
      Queue paused · cdwr agent resume
    </p>
  ) : (
    <p className={`cap-queue ${queueTone(false)}`}>Queue running</p>
  );
};

const Limits = ({ m, onSheet, pause }: Omit<Props, 'onView' | 'run'>) => (
  <article className={`${PANEL} cap-card cap-limits flex-[1_1_360px]`}>
    <div className={HEAD}>
      <span className={`cap-label ${CAP_LABEL}`}>LIMITS</span>
    </div>
    <PrsMeter m={m} onSheet={onSheet} />
    <EffortMeter m={m} />
    <Queue m={m} pause={pause} />
  </article>
);

// ---------- Hosts ----------

/** The NUC's three bars; each turns amber over the threshold the host verdict uses */
const NucRows = ({ n }: { n: NonNullable<Model['nuc']> }) => {
  const rows: { label: string; hint?: string; share: number; over: boolean }[] =
    [
      {
        label: 'CPU',
        share: n.cpu,
        over: n.cpu > HOST_LOAD_PER_CORE_MAX
      },
      {
        label: 'Memory',
        hint: n.memorySource === 'container' ? 'container' : undefined,
        share: n.memory,
        over: n.memory > HOST_MEM_USED_MAX
      },
      {
        label: 'Disk',
        share: n.disk,
        over: n.disk > 1 - HOST_DISK_FREE_MIN
      }
    ];
  return (
    <div className="cap-rows flex flex-col gap-2">
      {rows.map((r) => (
        <div
          key={r.label}
          className="cap-row grid grid-cols-[64px_minmax(0,1fr)_44px] items-center gap-2.5 text-[12px]"
        >
          <span className={`cap-k ${MUTED}`}>
            {r.label}
            {r.hint ? (
              <small className="cap-hint block text-[10px] text-[color:var(--faint)]">
                {r.hint}
              </small>
            ) : null}
          </span>
          <Bar share={r.share} tone={r.over ? 'wait' : 'neutral'} />
          <b
            className={`cap-pct ${MONO} text-right text-[12px] font-medium tabular-nums`}
          >
            {percent(r.share)}
          </b>
        </div>
      ))}
    </div>
  );
};

const NucHost = ({ m, run }: { m: Model; run: () => void }) => {
  const n = m.nuc;
  if (!n)
    return (
      <div className={HOST}>
        <div className={`cap-hh ${CAP_HH}`}>
          <i className={capDot('stale')} aria-hidden="true"></i>
          <b className={`cap-name ${CAP_NAME}`}>nuc</b>
        </div>
        <p className={`cap-sub ${CAP_SUB}`}>no samples yet</p>
      </div>
    );
  const sub =
    n.verdict === 'stale'
      ? `silent · last sample ${shortAge(n.ageMin)} ago`
      : `${n.busy ? 'busy' : 'idle'} · heartbeat ${shortAge(n.ageMin)} ago`;
  // Commands go to the host whose queue_state the desk reads; the button shows only when that is this one
  const c = m.controls?.host === n.host ? m.controls : null;
  return (
    <div className={HOST}>
      <div className={`cap-hh ${CAP_HH}`}>
        <i className={capDot(n.verdict)} aria-hidden="true"></i>
        <b className={`cap-name ${CAP_NAME}`}>{n.host}</b>
        {c ? (
          <CmdButton
            cmd="run"
            label="Run now"
            view={c.states.run}
            onClick={run}
          />
        ) : null}
      </div>
      <p className={`cap-sub ${CAP_SUB}`}>{sub}</p>
      {c ? <ControlStatus view={c.states.run} /> : null}
      <NucRows n={n} />
    </div>
  );
};

const MacHost = ({ m }: { m: Model }) => {
  const h = m.handBack;
  if (!h.host) return null;
  const ticket = h.state === 'attended' ? m.session?.ticket : undefined;
  const seen = h.ageMin === null ? '' : `seen ${shortAge(h.ageMin)} ago`;
  const sub = [seen, ticket].filter(Boolean).join(' · ');
  return (
    <div className={HOST}>
      <div className={`cap-hh ${CAP_HH}`}>
        <i className={capDot('mac')} aria-hidden="true"></i>
        <b className={`cap-name ${CAP_NAME}`}>{h.host}</b>
        {h.state === 'attended' ? (
          <span
            className={`cap-chip ${MONO} rounded-[var(--r-pill)] bg-[color:var(--work-soft)] px-2 py-px text-[10px] font-medium tracking-[0.1em] text-[color:var(--attended)]`}
          >
            ATTENDED
          </span>
        ) : null}
      </div>
      {sub ? <p className={`cap-sub ${CAP_SUB}`}>{sub}</p> : null}
      <p className={`cap-sub ${CAP_SUB}`}>no host_metrics on this host</p>
      <div
        className="cap-strip mt-1 flex gap-1.5"
        role="img"
        aria-label={`Hand-back to the NUC: ${h.state}, one of ${STEPS.join(', ')}`}
      >
        {STEPS.map((s) => (
          <span
            key={s}
            className={`${s === h.state ? 'on text-[color:var(--attended)]' : 'text-[color:var(--faint)]'} flex min-w-0 flex-[1_1_0] flex-col gap-1 text-[10px]`}
          >
            <i
              className={`block h-1 rounded-[var(--r-pill)] ${s === h.state ? 'bg-[color:var(--attended)]' : 'bg-[color:var(--line-strong)]'}`}
            ></i>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
};

/** The 24 hour CPU line with the runs shaded behind it; nothing without two samples */
const CpuDay = ({ m }: { m: Model }) => {
  const day = m.cpuDay;
  if (!day || day.points.length < 2) return null;
  const stats = [
    day.idle === null ? '' : `idle ${percent(day.idle)}`,
    day.inRuns === null ? '' : `in runs avg ${percent(day.inRuns)}`,
    day.peak ? `peak ${percent(day.peak.cpu)}` : ''
  ].filter(Boolean);
  return (
    <div className="cap-cpu flex flex-col gap-2 border-t border-[color:var(--line)] pt-3.5">
      <div
        className={`cap-cpuh flex flex-wrap justify-between gap-x-3 gap-y-1 text-[12px] ${MUTED}`}
      >
        <span>{m.nuc?.host ?? 'nuc'} CPU, 24 h · shaded = agent runs</span>
        <span
          className={`cap-stats ${MONO} text-[12px] font-normal text-[color:var(--fg)]`}
        >
          {stats.join(' · ')}
        </span>
      </div>
      <div>
        <CpuChart day={day} />
      </div>
      {day.peak ? (
        <p className={`cap-sub ${CAP_SUB}`}>
          Peak {day.peak.ticket ? `during ${day.peak.ticket} ` : ''}at{' '}
          {hhmm(day.peak.at)}
        </p>
      ) : null}
    </div>
  );
};

const Hosts = ({ m, onView, run }: Pick<Props, 'm' | 'onView' | 'run'>) => (
  <article className={`${PANEL} cap-card cap-hosts flex-[2_1_560px]`}>
    <div className={HEAD}>
      <span className={`cap-label ${CAP_LABEL}`}>HOSTS</span>
      <span className={`cap-src ${CAP_SRC}`}>
        host_metrics · live
        <button
          type="button"
          className="cap-link -my-3 min-h-[var(--tap)] border-0 bg-transparent px-1 py-0 font-[family-name:var(--font-ui)] text-[12px] leading-[normal] font-medium text-[color:var(--accent)]"
          data-view="platform"
          onClick={() => onView('platform')}
        >
          Platform ›
        </button>
      </span>
    </div>
    <div className="cap-grid grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-5">
      <NucHost m={m} run={run} />
      <MacHost m={m} />
    </div>
    <CpuDay m={m} />
  </article>
);

// ---------- Phone ----------

const Mini = ({
  label,
  value,
  share,
  tone
}: {
  label: string;
  value: string;
  share: number;
  tone: Tone;
}) => (
  <span className={`cap-mini ${tone} flex min-w-0 flex-col gap-[5px]`}>
    <span className={`${MH} text-[11px] ${MUTED}`}>
      <span>{label}</span>
      <b className={`${CV} ${VALUE[tone]}`}>{value}</b>
    </span>
    <Bar share={share} tone={tone} px={5} />
  </span>
);

/** "mac attended · nuc idle, heartbeat 8 s — tap for hosts" */
const phoneFoot = (m: Model): string => {
  const n = m.nuc;
  const parts = [
    m.handBack.host ? `${m.handBack.host} ${m.handBack.state}` : '',
    n
      ? n.verdict === 'stale'
        ? `${n.host} silent, last sample ${shortAge(n.ageMin)} ago`
        : `${n.host} ${n.busy ? 'busy' : 'idle'}, heartbeat ${shortAge(n.ageMin)}`
      : ''
  ].filter(Boolean);
  return `${parts.length ? parts.join(' · ') + ' — ' : ''}tap for hosts`;
};

const Phone = ({
  m,
  onView
}: {
  m: Model;
  onView: (view: 'platform') => void;
}) => {
  const loaded = m.runs !== null;
  const { used } = m.limits.prs;
  const max = m.limits.prs.max || LIMIT;
  const e = m.limits.effort;
  const n = m.nuc;
  return (
    <button
      type="button"
      className={`${FRAME} cap-phone hidden w-full cursor-pointer gap-2 border-[color:var(--line)] bg-[color:var(--surface)] text-left [font:inherit] hover:border-[color:var(--line-strong)] max-[600px]:flex`}
      data-view="platform"
      aria-label="Capacity: tap for hosts"
      onClick={() => onView('platform')}
    >
      <span className="cap-minis grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-4 gap-y-3">
        <Mini
          label="PRs in flight"
          value={loaded ? `${used}/${max}` : '–'}
          share={loaded ? used / max : 0}
          tone={loaded ? prsTone(used, max) : 'neutral'}
        />
        <Mini
          label="Effort today"
          value={e ? percent(e.share) : '–'}
          share={e ? e.share : 0}
          tone={e ? effortTone(e.share) : 'ok'}
        />
        <Mini
          label="nuc CPU"
          value={n ? percent(n.cpu) : '–'}
          share={n ? n.cpu : 0}
          tone={n && n.cpu > HOST_LOAD_PER_CORE_MAX ? 'wait' : 'neutral'}
        />
        <Mini
          label="nuc memory"
          value={n ? percent(n.memory) : '–'}
          share={n ? n.memory : 0}
          tone={n && n.memory > HOST_MEM_USED_MAX ? 'wait' : 'neutral'}
        />
      </span>
      <span className={`cap-foot ${MONO} text-[11px] font-normal ${MUTED}`}>
        {phoneFoot(m)}
      </span>
    </button>
  );
};

export const Capacity = ({ m, onSheet, onView, pause, run }: Props) => (
  <>
    <div className="cap-desk flex flex-wrap gap-[var(--gap-card)] max-[600px]:hidden">
      <Limits m={m} onSheet={onSheet} pause={pause} />
      <Hosts m={m} onView={onView} run={run} />
    </div>
    <Phone m={m} onView={onView} />
  </>
);
