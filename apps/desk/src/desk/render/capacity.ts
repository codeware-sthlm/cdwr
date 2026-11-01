import {
  HOST_DISK_FREE_MIN,
  HOST_LOAD_PER_CORE_MAX,
  HOST_MEM_USED_MAX,
  LIMIT
} from '../constants';
import { esc, hhmm, plural, shortAge, usd } from '../format';
import type { HandBackState } from '../live';
import type { Model } from '../model';

import { cpuChart } from './charts';

// The Capacity row between the cards and the tiles: limits and hosts on the desktop, one card on a phone

type Tone = 'neutral' | 'ok' | 'wait' | 'bad';

/** The agent PR limit with room for one more is already amber */
const prsTone = (used: number, max: number): Tone =>
  used >= max - 1 ? 'wait' : 'neutral';

const effortTone = (share: number): Tone =>
  share >= 1 ? 'bad' : share >= 0.8 ? 'wait' : 'ok';

const percent = (share: number): string => `${Math.round(share * 100)}%`;

/** The bar's fill, capped at the track */
const fill = (share: number): number => Math.max(0, Math.min(1, share)) * 100;

const bar = (share: number, tone: Tone, px = 6): string =>
  `<span class="cap-bar" style="height:${px}px" aria-hidden="true"><i class="${tone}" style="width:${fill(share).toFixed(1)}%"></i></span>`;

const prsMeter = (m: Model): string => {
  const loaded = m.runs !== null;
  const { used } = m.limits.prs;
  const max = m.limits.prs.max || LIMIT;
  const tone = loaded ? prsTone(used, max) : 'neutral';
  const note = !loaded
    ? ''
    : used >= max
      ? 'no slot free'
      : `${plural(max - used, 'slot', 'slots')} free · merges free a slot live`;
  return `<button type="button" class="cap-meter cap-btn ${tone}" data-w="limit" aria-haspopup="dialog">
      <span class="cap-mh"><span>Agent PRs in flight</span><b class="cap-v">${loaded ? `${used} / ${max}` : '–'}</b></span>
      ${bar(loaded ? used / max : 0, tone)}
      <span class="cap-note">${note}</span>
    </button>`;
};

const effortMeter = (m: Model): string => {
  const e = m.limits.effort;
  const tone = e ? effortTone(e.share) : 'ok';
  const note =
    m.runs === null
      ? ''
      : e
        ? `${usd(e.spent)} of the ${usd(e.cap)} cap · simulated, nothing billed · resets 00:00`
        : 'not published yet: the scheduler sends it after its next deploy';
  return `<div class="cap-meter ${tone}">
      <span class="cap-mh"><span>Agent effort today</span><b class="cap-v">${e ? percent(e.share) : '–'}</b></span>
      ${bar(e ? e.share : 0, tone)}
      <span class="cap-note">${esc(note)}</span>
    </div>`;
};

const renderLimits = (m: Model): string => {
  const queue =
    m.runs === null
      ? ''
      : m.limits.paused
        ? '<p class="cap-queue wait">Queue paused · cdwr agent resume</p>'
        : '<p class="cap-queue">Queue running</p>';
  return `<article class="card-top cap-card cap-limits">
    <div class="ct-head"><span class="cap-label">LIMITS</span></div>
    ${prsMeter(m)}
    ${effortMeter(m)}
    ${queue}
  </article>`;
};

// ---------- Hosts ----------

/** The NUC's three bars; each turns amber over the threshold the host verdict uses */
const nucRows = (n: NonNullable<Model['nuc']>): string => {
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
  return `<div class="cap-rows">${rows
    .map(
      (r) =>
        `<div class="cap-row"><span class="cap-k">${r.label}${r.hint ? `<small class="cap-hint">${r.hint}</small>` : ''}</span>${bar(r.share, r.over ? 'wait' : 'neutral')}<b class="cap-pct">${percent(r.share)}</b></div>`
    )
    .join('')}</div>`;
};

const nucHostBlock = (m: Model): string => {
  const n = m.nuc;
  if (!n)
    return `<div class="cap-host">
      <div class="cap-hh"><i class="cap-dot stale" aria-hidden="true"></i><b class="cap-name">nuc</b></div>
      <p class="cap-sub">no samples yet</p>
    </div>`;
  const sub =
    n.verdict === 'stale'
      ? `silent · last sample ${shortAge(n.ageMin)} ago`
      : `${n.busy ? 'busy' : 'idle'} · heartbeat ${shortAge(n.ageMin)} ago`;
  return `<div class="cap-host">
      <div class="cap-hh"><i class="cap-dot ${n.verdict}" aria-hidden="true"></i><b class="cap-name">${esc(n.host)}</b></div>
      <p class="cap-sub">${esc(sub)}</p>
      ${nucRows(n)}
    </div>`;
};

const STEPS: readonly HandBackState[] = [
  'attended',
  'handing back',
  'heartbeat ok',
  'idle'
];

const macHostBlock = (m: Model): string => {
  const h = m.handBack;
  if (!h.host) return '';
  const ticket = h.state === 'attended' ? m.session?.ticket : undefined;
  const seen = h.ageMin === null ? '' : `seen ${shortAge(h.ageMin)} ago`;
  const sub = [seen, ticket].filter(Boolean).join(' · ');
  return `<div class="cap-host">
      <div class="cap-hh"><i class="cap-dot mac" aria-hidden="true"></i><b class="cap-name">${esc(h.host)}</b>${h.state === 'attended' ? '<span class="cap-chip">ATTENDED</span>' : ''}</div>
      ${sub ? `<p class="cap-sub">${esc(sub)}</p>` : ''}
      <p class="cap-sub">no host_metrics on this host</p>
      <div class="cap-strip" role="img" aria-label="Hand-back to the NUC: ${esc(h.state)}, one of ${esc(STEPS.join(', '))}">${STEPS.map((s) => `<span class="${s === h.state ? 'on' : ''}"><i></i>${s}</span>`).join('')}</div>
    </div>`;
};

/** The 24 hour CPU line with the runs shaded behind it; nothing without two samples */
const cpuSection = (m: Model): string => {
  const day = m.cpuDay;
  if (!day || day.points.length < 2) return '';
  const stats = [
    day.idle === null ? '' : `idle ${percent(day.idle)}`,
    day.inRuns === null ? '' : `in runs avg ${percent(day.inRuns)}`,
    day.peak ? `peak ${percent(day.peak.cpu)}` : ''
  ].filter(Boolean);
  const peak = day.peak
    ? `<p class="cap-sub">Peak ${day.peak.ticket ? `during ${esc(day.peak.ticket)} ` : ''}at ${esc(hhmm(day.peak.at))}</p>`
    : '';
  return `<div class="cap-cpu">
      <div class="cap-cpuh"><span>${esc(m.nuc?.host ?? 'nuc')} CPU, 24 h · shaded = agent runs</span><span class="cap-stats">${esc(stats.join(' · '))}</span></div>
      ${cpuChart(day)}
      ${peak}
    </div>`;
};

const renderHosts = (m: Model): string =>
  `<article class="card-top cap-card cap-hosts">
    <div class="ct-head"><span class="cap-label">HOSTS</span><span class="cap-src">host_metrics · live<button type="button" class="cap-link" data-view="platform">Platform ›</button></span></div>
    <div class="cap-grid">${nucHostBlock(m)}${macHostBlock(m)}</div>
    ${cpuSection(m)}
  </article>`;

// ---------- Phone ----------

const mini = (
  label: string,
  value: string,
  share: number,
  tone: Tone
): string =>
  `<span class="cap-mini ${tone}"><span class="cap-mh"><span>${label}</span><b class="cap-v">${value}</b></span>${bar(share, tone, 5)}</span>`;

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

const renderPhone = (m: Model): string => {
  const loaded = m.runs !== null;
  const { used } = m.limits.prs;
  const max = m.limits.prs.max || LIMIT;
  const e = m.limits.effort;
  const n = m.nuc;
  return `<button type="button" class="card-top cap-phone" data-view="platform" aria-label="Capacity: tap for hosts">
    <span class="cap-minis">
      ${mini('PRs in flight', loaded ? `${used}/${max}` : '–', loaded ? used / max : 0, loaded ? prsTone(used, max) : 'neutral')}
      ${mini('Effort today', e ? percent(e.share) : '–', e ? e.share : 0, e ? effortTone(e.share) : 'ok')}
      ${mini('nuc CPU', n ? percent(n.cpu) : '–', n ? n.cpu : 0, n && n.cpu > HOST_LOAD_PER_CORE_MAX ? 'wait' : 'neutral')}
      ${mini('nuc memory', n ? percent(n.memory) : '–', n ? n.memory : 0, n && n.memory > HOST_MEM_USED_MAX ? 'wait' : 'neutral')}
    </span>
    <span class="cap-foot">${esc(phoneFoot(m))}</span>
  </button>`;
};

// `now` keeps the signature of the other cards; every age here is already in the model
export const renderCapacity = (m: Model): string =>
  `<div class="cap-desk">${renderLimits(m)}${renderHosts(m)}</div>${renderPhone(m)}`;
