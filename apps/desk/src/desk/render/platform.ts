import { SESSION_ATTENDED_MIN, SESSION_HANDBACK_MIN } from '../constants';
import { ageText, esc, hhmm, plural, runTime, shortAge, usd } from '../format';
import { type HandBackState, type ProblemKey, problemKey } from '../live';
import type { Model, VersionState } from '../model';

import { STEPS, percent } from './capacity';
import { platform } from './header';

// The Platform view: hosts, versions and health, read-only. It fills `#platform` in place of the desk's cards.

type Tone = 'ok' | 'wait' | 'bad' | 'muted' | 'work';

const chip = (text: string, tone: Tone): string =>
  `<span class="pf-chip ${tone}">${esc(text)}</span>`;

const section = (label: string, src: string, body: string): string =>
  `<section class="card-top pf-card">
    <div class="ct-head"><h2 class="cap-label">${label}</h2>${src ? `<span class="cap-src">${src}</span>` : ''}</div>
    ${body}
  </section>`;

// ---------- Controls ----------

const controlRow = (
  title: string,
  line: string,
  value: string,
  tone = ''
): string =>
  `<div class="pf-row"><div class="pf-main"><b>${esc(title)}</b><span class="pf-line">${line}</span></div><b class="pf-val ${tone}">${esc(value)}</b></div>`;

const schedulerRow = (m: Model): string => {
  const last = m.runs?.last
    ? `last run ${hhmm(runTime(m.runs.last.when))}`
    : 'no run yet';
  const value = m.live ? 'on events' : m.nextRun ? `~${hhmm(m.nextRun)}` : '–';
  const buttons = (
    [
      ['scheduler', 'details'],
      ['timers', 'timers'],
      ['runs', 'runs']
    ] as const
  )
    .map(
      ([id, label]) =>
        `<button type="button" class="pf-mini" data-w="${id}" aria-haspopup="dialog">${label}</button>`
    )
    .join('');
  return `<div class="pf-row"><div class="pf-main"><b>Scheduler</b><span class="pf-line">${esc(last)}</span><span class="pf-btns">${buttons}</span></div><b class="pf-val">${esc(value)}</b></div>`;
};

const controls = (m: Model): string => {
  const loaded = m.runs !== null;
  const { used, max } = m.limits.prs;
  const e = m.limits.effort;
  const queue = !loaded ? '–' : m.limits.paused ? 'Paused' : 'Running';
  return section(
    'CONTROLS',
    'read-only',
    `<div class="pf-rows">
      ${controlRow('Queue', 'cdwr agent pause · cdwr agent resume', queue, m.limits.paused ? 'wait' : '')}
      ${controlRow('Agent PRs in flight', `${used} open now · set per session with /work-queue limit=N`, loaded ? String(max) : '–')}
      ${controlRow('Daily effort cap', `${e ? percent(e.share) : '–'} used today · AGENT_QUEUE_IMPLEMENT_CAP_USD on the host`, e ? usd(e.cap) : '–')}
      ${schedulerRow(m)}
    </div>
    <p class="pf-foot">Read-only here. Steering from the desk is COD-680; the CLI steers the queue today.</p>`
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
  'heartbeat ok': {
    label: 'heartbeat ok',
    sub: 'the NUC sampled within its silent limit'
  },
  idle: { label: 'idle', sub: 'the NUC is silent too; queue may schedule' }
};

const macPanel = (m: Model): string => {
  const h = m.handBack;
  if (!h.host) return '';
  const attended = h.state === 'attended';
  const ticket = attended ? m.session?.ticket : undefined;
  const text =
    attended && ticket
      ? `you are on ${ticket} · the queue schedules nothing here`
      : h.ageMin === null
        ? ''
        : `seen ${shortAge(h.ageMin)} ago`;
  return `<div class="pf-box mac">
      <div class="cap-hh"><i class="cap-dot mac" aria-hidden="true"></i><b class="cap-name">${esc(h.host)}</b>${attended ? '<span class="pf-chip work on">ATTENDED</span>' : `<span class="pf-chip muted">${esc(h.state.toUpperCase())}</span>`}</div>
      ${text ? `<p class="cap-sub">${esc(text)}</p>` : ''}
      <div class="pf-strip" role="img" aria-label="Hand-back to the NUC: ${esc(h.state)}, one of ${esc(STEPS.join(', '))}">${STEPS.map((s) => `<span class="${s === h.state ? 'on' : ''}"><i></i><b>${STEP_RULE[s].label}</b><small>${esc(STEP_RULE[s].sub)}</small></span>`).join('')}</div>
      <p class="pf-rule">Computed from sessions alone: the Mac's newest attended heartbeat within ${SESSION_ATTENDED_MIN} min is attended, within ${SESSION_HANDBACK_MIN} min it is handing back; after that the NUC's heartbeat decides between heartbeat ok and idle.</p>
    </div>`;
};

const VERDICT: Record<string, { text: string; tone: Tone }> = {
  idle: { text: 'IDLE', tone: 'ok' },
  busy: { text: 'BUSY', tone: 'ok' },
  stale: { text: 'STALE', tone: 'muted' },
  bad: { text: 'BAD', tone: 'bad' }
};

const nucRow = (m: Model): string => {
  const n = m.nuc;
  const host = m.host;
  if (!n || !host)
    return `<div class="pf-box"><div class="cap-hh"><i class="cap-dot stale" aria-hidden="true"></i><b class="cap-name">nuc</b></div><p class="cap-sub">no samples yet</p></div>`;
  const v =
    VERDICT[n.verdict === 'ok' ? (n.busy ? 'busy' : 'idle') : n.verdict];
  const text = `heartbeat ${shortAge(n.ageMin)} ago · every ${Math.round(host.intervalMin)} min · CPU ${percent(n.cpu)}`;
  return `<div class="pf-box">
      <div class="cap-hh"><i class="cap-dot ${n.verdict}" aria-hidden="true"></i><b class="cap-name">${esc(n.host)}</b>${chip(v.text, v.tone)}</div>
      <p class="cap-sub">${esc(text)}</p>
    </div>`;
};

const macToday = (m: Model): string => {
  if (!m.handBack.host && !m.macToday.length) return '';
  const rows = m.macToday.map(
    (e) =>
      `<span class="pf-t">${esc(hhmm(e.lastSeen))}</span><span>${esc(e.kind)} session · last seen</span>`
  );
  if (m.handBack.state === 'attended')
    rows.push(`<span class="pf-t">now</span><span>attended</span>`);
  return `<div class="pf-today">
      <h3 class="pf-sub">mac today</h3>
      ${rows.length ? `<div class="pf-times">${rows.join('')}</div>` : '<p class="cap-sub">no sessions today</p>'}
    </div>`;
};

const hosts = (m: Model): string =>
  section(
    'HOSTS &amp; HEARTBEAT',
    'sessions + host_metrics',
    `${macPanel(m)}${nucRow(m)}${macToday(m)}`
  );

// ---------- Versions ----------

const versionRow = (
  title: string,
  v: VersionState,
  behindText: string,
  extra = ''
): string => {
  const [text, tone, mono]: [string, Tone, string] =
    v.state === 'behind'
      ? [behindText, 'wait', `${v.runs} → ${v.main}`]
      : v.state === 'current'
        ? ['up to date', 'ok', v.runs ?? '–']
        : ['unknown', 'muted', v.runs ?? '–'];
  return `<div class="pf-row"><div class="pf-main"><b>${esc(title)}</b>${extra ? `<span class="pf-line">${esc(extra)}</span>` : ''}</div><div class="pf-ver">${chip(text, tone)}<code class="pf-mono">${esc(mono)}</code></div></div>`;
};

const installRow = (m: Model): string => {
  const install = m.versions.install;
  const items = m.runs?.job?.items ?? '';
  const [chipText, tone, line]: [string, Tone, string] =
    install === 'current'
      ? ['current', 'ok', 'matches main']
      : install === 'stale'
        ? ['stale', 'wait', `out of date${items ? ` (${items})` : ''}`]
        : ['unknown', 'muted', 'unknown'];
  return `<div class="pf-row"><div class="pf-main"><b>Scheduler scripts</b></div><div class="pf-ver">${chip(chipText, tone)}<span class="pf-mono">${esc(line)}</span></div></div>`;
};

const versions = (m: Model): string =>
  section(
    'VERSIONS &amp; UPDATES',
    '',
    `<div class="pf-rows">
      ${versionRow('nuc image', m.versions.image, 'update available')}
      ${versionRow('This desk', m.versions.desk, 'out of date', m.versions.desk.state === 'behind' ? 'reload the desk to update' : '')}
      ${installRow(m)}
    </div>`
  );

// ---------- Health ----------

const PROBLEM_OF = (name: string): ProblemKey | null =>
  name === 'Realtime'
    ? 'connection'
    : name === 'queue_state parses'
      ? 'data-parse'
      : name === 'Snapshot age'
        ? 'data-stale'
        : name.endsWith(' heartbeat')
          ? 'unknown'
          : null;

const whyOf = (m: Model, key: ProblemKey | null): string => {
  const problem = key && m.problems.find((p) => problemKey(p) === key);
  const text = esc(problem?.text || 'failing');
  return problem
    ? `<small class="pf-why"><button type="button" class="pf-problem" data-problem="${key}">${text}</button></small>`
    : `<small class="pf-why">${text}</small>`;
};

const healthChecks = (m: Model, now: Date): string => {
  const rows = m.health
    .map((c) => {
      const why = c.ok ? '' : whyOf(m, PROBLEM_OF(c.name));
      const age =
        c.at === null ? 'never' : ageText((now.getTime() - c.at) / 6e4);
      return `<i class="cap-dot ${c.ok ? '' : 'bad'}" aria-hidden="true"></i><span class="pf-hname"><span>${esc(c.name)}</span>${why}</span><code class="pf-mono">${esc(age)}</code>`;
    })
    .join('');
  return section(
    'HEALTH CHECKS',
    '',
    m.health.length
      ? `<div class="pf-health">${rows}</div>`
      : '<p class="cap-sub">no checks yet</p>'
  );
};

// ---------- The view ----------

export const renderPlatform = (m: Model, now: Date): string => {
  const p = platform(m);
  const ok = m.health.filter((c) => c.ok).length;
  const checks = !m.runs
    ? '<span class="pf-stat">checks –</span>'
    : p.failing.length
      ? `<span class="pf-stat bad">${p.failing.length} failing</span>`
      : `<span class="pf-stat ok">${ok} of ${m.health.length} checks ok</span>`;
  const updates = p.updates
    ? `<span class="pf-stat wait">${esc(plural(p.updates, 'update', 'updates'))}</span>`
    : '';
  return `<div class="pf-head">
      <button type="button" class="pf-back" data-view="desk">‹ Desk</button>
      <div class="pf-title"><h1 id="platform-title" tabindex="-1">Platform</h1><span class="cap-sub">hosts, versions and health — read-only; the controls come with COD-680</span></div>
      <div class="pf-stats">${checks}${updates}</div>
    </div>
    <div class="pf-grid">${controls(m)}${hosts(m)}${versions(m)}${healthChecks(m, now)}</div>`;
};
