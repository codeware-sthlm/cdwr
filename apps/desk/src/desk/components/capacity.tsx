import {
  HOST_DISK_FREE_MIN,
  HOST_LOAD_PER_CORE_MAX,
  HOST_MEM_USED_MAX,
  LIMIT
} from '../constants';
import { hhmm, plural, shortAge, usd } from '../format';
import type { HandBackState } from '../live';
import type { Model } from '../model';
import { cpuChart } from '../render/charts';

import { CmdButton, ControlStatus } from './controls';

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

const Bar = ({
  share,
  tone,
  px = 6
}: {
  share: number;
  tone: Tone;
  px?: number;
}) => (
  <span className="cap-bar" style={{ height: px }} aria-hidden="true">
    <i className={tone} style={{ width: `${fill(share).toFixed(1)}%` }}></i>
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
      className={`cap-meter cap-btn ${tone}`}
      data-w="limit"
      aria-haspopup="dialog"
      onClick={() => onSheet('limit')}
    >
      <span className="cap-mh">
        <span>Agent PRs in flight</span>
        <b className="cap-v">{loaded ? `${used} / ${max}` : '–'}</b>
      </span>
      <Bar share={loaded ? used / max : 0} tone={tone} />
      <span className="cap-note">{note}</span>
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
    <div className={`cap-meter ${tone}`}>
      <span className="cap-mh">
        <span>Agent effort today</span>
        <b className="cap-v">{e ? percent(e.share) : '–'}</b>
      </span>
      <Bar share={e ? e.share : 0} tone={tone} />
      <span className="cap-note">{note}</span>
    </div>
  );
};

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
      <p className={`cap-queue ${paused ? 'wait' : ''}`}>
        {word}{' '}
        <CmdButton
          cmd={kind}
          label={paused ? 'Resume' : 'Pause'}
          view={c.states.pause}
          onClick={() => pause(kind)}
        />
        <ControlStatus view={c.states.pause} />
      </p>
    );
  }
  return paused ? (
    <p className="cap-queue wait">Queue paused · cdwr agent resume</p>
  ) : (
    <p className="cap-queue">Queue running</p>
  );
};

const Limits = ({ m, onSheet, pause }: Omit<Props, 'onView' | 'run'>) => (
  <article className="card-top cap-card cap-limits">
    <div className="ct-head">
      <span className="cap-label">LIMITS</span>
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
    <div className="cap-rows">
      {rows.map((r) => (
        <div key={r.label} className="cap-row">
          <span className="cap-k">
            {r.label}
            {r.hint ? <small className="cap-hint">{r.hint}</small> : null}
          </span>
          <Bar share={r.share} tone={r.over ? 'wait' : 'neutral'} />
          <b className="cap-pct">{percent(r.share)}</b>
        </div>
      ))}
    </div>
  );
};

const NucHost = ({ m, run }: { m: Model; run: () => void }) => {
  const n = m.nuc;
  if (!n)
    return (
      <div className="cap-host">
        <div className="cap-hh">
          <i className="cap-dot stale" aria-hidden="true"></i>
          <b className="cap-name">nuc</b>
        </div>
        <p className="cap-sub">no samples yet</p>
      </div>
    );
  const sub =
    n.verdict === 'stale'
      ? `silent · last sample ${shortAge(n.ageMin)} ago`
      : `${n.busy ? 'busy' : 'idle'} · heartbeat ${shortAge(n.ageMin)} ago`;
  // Commands go to the host whose queue_state the desk reads; the button shows only when that is this one
  const c = m.controls?.host === n.host ? m.controls : null;
  return (
    <div className="cap-host">
      <div className="cap-hh">
        <i className={`cap-dot ${n.verdict}`} aria-hidden="true"></i>
        <b className="cap-name">{n.host}</b>
        {c ? (
          <CmdButton
            cmd="run"
            label="Run now"
            view={c.states.run}
            onClick={run}
          />
        ) : null}
      </div>
      <p className="cap-sub">{sub}</p>
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
    <div className="cap-host">
      <div className="cap-hh">
        <i className="cap-dot mac" aria-hidden="true"></i>
        <b className="cap-name">{h.host}</b>
        {h.state === 'attended' ? (
          <span className="cap-chip">ATTENDED</span>
        ) : null}
      </div>
      {sub ? <p className="cap-sub">{sub}</p> : null}
      <p className="cap-sub">no host_metrics on this host</p>
      <div
        className="cap-strip"
        role="img"
        aria-label={`Hand-back to the NUC: ${h.state}, one of ${STEPS.join(', ')}`}
      >
        {STEPS.map((s) => (
          <span key={s} className={s === h.state ? 'on' : ''}>
            <i></i>
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
    <div className="cap-cpu">
      <div className="cap-cpuh">
        <span>{m.nuc?.host ?? 'nuc'} CPU, 24 h · shaded = agent runs</span>
        <span className="cap-stats">{stats.join(' · ')}</span>
      </div>
      {/* The chart is numbers and an escaped label, built by the string renderer */}
      <div dangerouslySetInnerHTML={{ __html: cpuChart(day) }} />
      {day.peak ? (
        <p className="cap-sub">
          Peak {day.peak.ticket ? `during ${day.peak.ticket} ` : ''}at{' '}
          {hhmm(day.peak.at)}
        </p>
      ) : null}
    </div>
  );
};

const Hosts = ({ m, onView, run }: Pick<Props, 'm' | 'onView' | 'run'>) => (
  <article className="card-top cap-card cap-hosts">
    <div className="ct-head">
      <span className="cap-label">HOSTS</span>
      <span className="cap-src">
        host_metrics · live
        <button
          type="button"
          className="cap-link"
          data-view="platform"
          onClick={() => onView('platform')}
        >
          Platform ›
        </button>
      </span>
    </div>
    <div className="cap-grid">
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
  <span className={`cap-mini ${tone}`}>
    <span className="cap-mh">
      <span>{label}</span>
      <b className="cap-v">{value}</b>
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
      className="card-top cap-phone"
      data-view="platform"
      aria-label="Capacity: tap for hosts"
      onClick={() => onView('platform')}
    >
      <span className="cap-minis">
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
      <span className="cap-foot">{phoneFoot(m)}</span>
    </button>
  );
};

export const Capacity = ({ m, onSheet, onView, pause, run }: Props) => (
  <>
    <div className="cap-desk">
      <Limits m={m} onSheet={onSheet} pause={pause} />
      <Hosts m={m} onView={onView} run={run} />
    </div>
    <Phone m={m} onView={onView} />
  </>
);
