const SERVER = 'Linear';
const TEAM = 'Codeware';
const STATES = ['triage', 'backlog', 'unstarted', 'started'];
const FIELDS = [
  'title',
  'priority',
  'status',
  'statusType',
  'labels',
  'createdAt',
  'url'
];
const AGENT = [
  'agent:needs-input',
  'agent:working',
  'agent:ready',
  'agent:review'
];
const OTHER_REPOS = ['nx-plugins', 'enjinex'];
const CLOSED_WINDOW = '-P30D';
const IDEA_LABEL = 'agent-idea'; // the Source label of a daily suggestion (COD-579)
const IDEA_WINDOW = '-P60D'; // how far back the accepted and discarded ideas are shown
const ACTIVITY_STALE_MIN = 30; // the document's Updated line older than this shows in the warning colour
const LINEAR_ISSUE = 'https://linear.app/codeware/issue/';
// The codeware-agent GitHub App's avatar, embedded: the page can't load images from GitHub
const AGENT_AVATAR =
  'data:image/png;base64,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';
const ROLES = ['planning', 'orchestrating', 'implementing'];
const STALE_HOURS = 2; // a scheduler silent this long is a problem
const STUCK_MIN = 5; // a session polling this long while the queue has work for it missed the wake
const INSTALL_MINUTES = 10; // what cdwr agent install writes (RUN_INTERVAL_SECONDS 600), assumed until the Job line says
const LIMIT = 5; // the default limit of open agent PRs, used until the queue view says
const ROWS = 5; // rows a column shows before "+ n more"; keeps the main view on one screen
const GH_PR = 'https://github.com/codeware-sthlm/cdwr/pull/';
const PRIO = { 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low', 0: 'None' };
const PRIO_MARK = { 1: '!!!', 2: '▲▲', 3: '▲', 4: '▽', 0: '–' };

const buckets = {}; // state type -> issues
const details = {}; // id -> { steps, done, next, blockedBy }
const liveHandoffs = {}; // id -> unticked hand-off items read from the ticket's comments, ahead of the queue view
const errors = {}; // source -> error
let closed = null; // agent tickets completed in the last 30 days
let ideas = null; // agent-idea tickets updated in the last 60 days, every state
const ideaReasons = {}; // id -> the discard word: the cancelled ticket's last comment
let runs = null; // payload of the "runs" tool: { last, attended, job, qv (the queue view), rows: [{ when, outcome, ticket, detail }] }
let usage = null; // payload of the "usage" tool: { updated, windowDays, total, pricesDate, unpriced, models, days, tickets }
let activity = null; // payload of the "activity" tool: { updated, header, dropped, rows: [{ when, ticket, actor, change }] }, or { missing: true }
let actFilter = 'all'; // the Activity sheet's ticket filter
let storedAt = null;
let filter = 'all';
let openSheet = null;
let mcp = null; // the data adapter, set by start()

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
// Links in text from Linear can't be followed here, so show their name: [text](url) → text,
// a Linear issue URL → its id (COD-123), a GitHub PR or issue URL → #n, any other URL → host and path
const linkName = (u) => {
  const lin = u.match(/^https?:\/\/linear\.app\/[^/]+\/issue\/([A-Za-z]+-\d+)/);
  if (lin) return lin[1].toUpperCase();
  const gh = u.match(
    /^https?:\/\/github\.com\/[^/]+\/[^/]+\/(?:pull|issues)\/(\d+)/
  );
  if (gh) return '#' + gh[1];
  return u.replace(/^https?:\/\/(www\.)?/, '').replace(/[/?#]+$/, '');
};
const tidy = (s) =>
  String(s ?? '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, t, u) =>
      /^https?:\/\//.test(t.trim()) ? linkName(t.trim()) : t
    )
    .replace(/<(https?:\/\/[^>\s]+)>/g, (_, u) => linkName(u))
    .replace(
      /https?:\/\/[^\s)\]>"']+/g,
      (u) =>
        linkName(u.replace(/[.,;:]+$/, '')) + (u.match(/[.,;:]+$/)?.[0] || '')
    );
const txt = (s) => esc(tidy(s));
const inline = (s) => txt(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const rankOf = (i) => i.priority?.value || 5;
// Status first (In Progress, Todo, Backlog, Triage), then priority, then oldest
const STATUS_RANK = { started: 0, unstarted: 1, backlog: 2, triage: 3 };
const statusOf = (i) => STATUS_RANK[i.statusType] ?? 4;
const byQueue = (a, b) =>
  statusOf(a) - statusOf(b) ||
  rankOf(a) - rankOf(b) ||
  a.createdAt.localeCompare(b.createdAt);
const agentState = (i) =>
  (i.labels || []).find((l) => AGENT.includes(l))?.slice(6) || null;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const ticketLine = (x) => (x ? x.i.id + ' ' + x.i.title : '');

const ICON = {
  plan: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  question:
    '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  review:
    '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M6 9v12"/>',
  handoff:
    '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 14l2 2 4-4"/>',
  load: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  working:
    '<path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.9 4.9l2.9 2.9"/><path d="M16.2 16.2l2.9 2.9"/><path d="M2 12h4"/><path d="M18 12h4"/>',
  answered:
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10l2 2 4-4"/>',
  next: '<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>',
  blocked: '<circle cx="12" cy="12" r="10"/><path d="M4.9 4.9l14.2 14.2"/>',
  sched: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9a2.5 2.5 0 0 0-2.3-1.5h-1a2.3 2.3 0 0 0 0 4.5h1a2.3 2.3 0 0 1 0 4.5h-1A2.5 2.5 0 0 1 9.2 15"/><path d="M12 6v1.5"/><path d="M12 16.5V18"/>',
  ticket:
    '<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  bars: '<path d="M3 21h18"/><path d="M7 21V11"/><path d="M12 21V5"/><path d="M17 21v-7"/>',
  timer:
    '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22"/><path d="M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
  all: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'
};
const icon = (k) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

// ---------- Data ----------

function openIssues() {
  const seen = new Map();
  for (const s of STATES)
    for (const i of buckets[s] || []) {
      if (i.statusType === 'completed' || i.statusType === 'canceled') continue;
      if ((i.labels || []).some((l) => OTHER_REPOS.includes(l))) continue;
      seen.set(i.id, i);
    }
  return [...seen.values()].sort(byQueue);
}

function parsePlan(desc) {
  const lines = String(desc || '').split('\n');
  let steps = 0,
    done = 0,
    inTable = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('|')) {
      if (inTable) inTable = false;
      continue;
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (!inTable) {
      if (
        /^step$/i.test(cells[0] || '') &&
        cells.some((c) => /^status$/i.test(c))
      )
        inTable = true;
      continue;
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    steps++;
    if (/^done\b/i.test(cells[cells.length - 1] || '')) done++;
  }
  const next =
    (desc || '').match(/\*\*Next:?\*\*:?\s*(.+)/i)?.[1]?.trim() || null;
  return { steps, done, next };
}

const byCreated = (a, b) =>
  String(a.createdAt).localeCompare(String(b.createdAt));

// Suggested (COD-579): run.sh `suggested_line`, "YYYY-MM-DD · COD-123 <title>", "nothing today",
// "COD-123 still open", "stopped at the budget", "failed" or "no verdict". Linear may wrap ids in mention tags.
export function parseSuggested(text) {
  const sm = text.match(/^Suggested:\s*(\d{4}-\d\d-\d\d)\s*·\s*(.*)$/m);
  if (!sm) return null;
  const rest = sm[2].replace(/<[^>]+>/g, '').trim();
  const t = rest.match(/^([A-Z]+-\d+)\s*(.*)$/);
  if (t && /still open$/.test(rest))
    return { date: sm[1], kind: 'open', ticket: t[1], text: rest };
  if (t)
    return {
      date: sm[1],
      kind: 'suggested',
      ticket: t[1],
      title: t[2],
      text: rest
    };
  const kind =
    rest === 'nothing today'
      ? 'nothing'
      : /budget/.test(rest)
        ? 'cap'
        : rest === 'failed'
          ? 'failed'
          : 'other';
  return { date: sm[1], kind, text: rest };
}
// A suggestion's description, as the suggest-improvement skill writes it: Evidence bullets, What changes, Cost, Focus, Why now
function parseIdea(desc) {
  const text = String(desc || '');
  const section = (name) =>
    (text.split(new RegExp('^## ' + name + '\\s*$', 'm'))[1] || '')
      .split(/^## /m)[0]
      .trim();
  const bullets = (s) =>
    s
      .split('\n')
      .map((l) => l.match(/^\s*[-*]\s+(.*)$/)?.[1])
      .filter(Boolean);
  const evidence = section('Evidence'),
    change = section('What changes');
  if (!evidence && !change) return null;
  return {
    evidence: bullets(evidence),
    change,
    cost: section('Cost'),
    focus: section('Focus').split('\n')[0].split(',')[0].trim(),
    why: section('Why now')
      .split('\n')
      .filter((l) => !/^Accept:/.test(l.trim()))
      .join('\n')
      .trim()
  };
}
const ideaVerdict = (i) =>
  i.statusType === 'canceled'
    ? 'discarded'
    : agentState(i) || i.statusType === 'completed'
      ? 'accepted'
      : 'to decide';

// Unticked items of the newest "**Agent: PR ready**" comment's "Hand-off checklist:" block, as watch.jq `handoffs` reads them
function parseHandoffs(comments) {
  const c = (comments || [])
    .filter((x) => String(x.body || '').startsWith('**Agent: PR ready**'))
    .sort(byCreated)
    .pop();
  if (!c) return [];
  const lines = c.body.split('\n');
  const at = lines.findIndex(
    (l) =>
      l
        .trim()
        .replace(/^\*\*|\*\*$/g, '')
        .toLowerCase() === 'hand-off checklist:'
  );
  if (at < 0) return [];
  const items = [];
  for (const l of lines.slice(at + 1)) {
    if (/^\s*$/.test(l)) continue;
    const open = l.match(/^\s*[-*] \[ \] (.*)$/);
    if (open) {
      items.push(open[1].trim());
      continue;
    }
    if (/^\s*[-*] \[[xX]\] /.test(l)) continue;
    break;
  }
  return items;
}

// The runs document: a "Last run:" line, an "Attended:" line, a "Job:" line, then a table of runs that weren't idle, newest first
// OK: idle, or planned a ticket ("planned" in a row, "planned COD-123" on the last-run line)
// Job: on launchd "every 10 min · install current", "· install out of date (run.sh, interval)" or "· install unknown";
// in the agent-host container "· image sha-9c7a20d", "· image sha-9c7a20d out of date (run.sh, …)", or "· image" with no
// commit for a local build (the commit arrives with the ticket that bakes it into the image)
export function parseJob(text) {
  const jm = text.match(/^Job:\s*(.+)$/m);
  if (!jm) return null;
  const line = jm[1].trim();
  const minutes = Number(line.match(/every (\d+) min/)?.[1]) || null;
  const host = /·\s*image\b/.test(line)
    ? 'container'
    : /·\s*install\b/.test(line)
      ? 'launchd'
      : null;
  const rev = line.match(/·\s*image (sha-[0-9a-f]{7,40})\b/)?.[1] || null;
  const install = /out of date/.test(line)
    ? 'stale'
    : /install current/.test(line) ||
        (host === 'container' && !/unknown/.test(line))
      ? 'current'
      : 'unknown';
  return {
    line,
    minutes,
    host,
    rev,
    install,
    items: line.match(/out of date \(([^)]*)\)/)?.[1] || ''
  };
}
const HOST = { container: 'Container', launchd: 'Mac · launchd' };
const GH_COMMIT = 'https://github.com/codeware-sthlm/cdwr/commit/';
// "Container · sha-9c7a20d" (the commit links to GitHub), "Mac · launchd", or nothing before the line says
function hostHTML(job) {
  if (!job?.host) return '';
  const rev = job.rev
    ? ` · <a class="prn" href="${GH_COMMIT + esc(job.rev.slice(4))}" target="_blank" rel="noopener">${esc(job.rev)}</a>`
    : '';
  return esc(HOST[job.host]) + rev;
}
// What to do about scripts that differ from main: pull a newer image, or reinstall on the Mac
const updateHint = (job) =>
  job?.host === 'container'
    ? 'pull the new image: <code>docker compose pull && docker compose up -d</code> in <code>apps/agent-host</code>'
    : 'run <code>cdwr agent install</code>';
// The queue view (watch.jq `queue_view`, COD-556): a fenced JSON block in the runs document, the one
// source of what the agent takes next, what the limit holds, and what waits on Håkan before and after
export function validateQueueView(v) {
  if (!v || !v.limit || !v.table) return null;
  return {
    at: v.at,
    limit: v.limit,
    session: v.session || { state: 'none' },
    next: v.next || [],
    held: v.held || { tickets: [], free: [] },
    parked: v.parked || [],
    table: { before: v.table.before || [], after: v.table.after || [] }
  };
}
// Attended (COD-545): watch.jq `attended_line`, what an attended /work-queue would take now.
// "running: COD-1 · <Next line>", "run now: COD-2 answered" (or review feedback, ready, take over COD-3 …),
// "idle: waits on …; limit 3/5". Missing when the scheduler couldn't compute one. Linear may wrap ids in mention tags.
export function parseAttended(text) {
  const am = text.match(/^Attended:\s*(running|run now|idle):\s*(.*)$/m);
  if (!am) return null;
  return { verdict: am[1], text: am[2].replace(/<[^>]+>/g, '').trim() };
}
const withIds = (s) =>
  inline(s).replace(
    /\b([A-Z]+-\d+)\b/g,
    (id) =>
      `<a class="id" href="${LINEAR_ISSUE + id}" target="_blank" rel="noopener">${id}</a>`
  );
const ATTENDED = { running: 'Running', 'run now': 'Run now', idle: 'Idle' };
const activityAge = () =>
  activity?.updated
    ? (Date.now() - Date.parse(activity.updated.replace(' ', 'T'))) / 6e4
    : null;
const ageText = (min) =>
  min < 60
    ? `${Math.max(0, Math.round(min))} min ago`
    : min < 48 * 60
      ? `${Math.round(min / 60)} h ago`
      : `${Math.round(min / 1440)} days ago`;

const runTime = (when) => Date.parse(when.replace(' ', 'T'));
const isProblem = (outcome) =>
  !/^(idle|planned( [A-Z]+-\d+)?|launched|implemented|suggested( [A-Z]+-\d+)?|nothing|skip)$/.test(
    outcome
  );

// Titles and links for the ids the queue view names: open tickets, then the recently closed
function issueIndex() {
  const map = new Map();
  for (const i of closed || []) map.set(i.id, i);
  for (const s of STATES) for (const i of buckets[s] || []) map.set(i.id, i);
  return map;
}
const stub = (id) => ({
  id,
  title: '',
  url: LINEAR_ISSUE + id,
  status: '',
  priority: null
});

// Blockers before the PRs they block, otherwise the queue view's order; a cycle falls back to that order
function mergeOrder(prs, blockersOf) {
  const byTicket = new Map(prs.map((x) => [x.ticket, x]));
  const placed = new Set(),
    out = [];
  const visit = (x, path) => {
    if (placed.has(x.ticket) || path.has(x.ticket)) return;
    path.add(x.ticket);
    for (const b of blockersOf(x.ticket))
      if (byTicket.has(b)) visit(byTicket.get(b), path);
    path.delete(x.ticket);
    placed.add(x.ticket);
    out.push(x);
  };
  for (const x of prs) visit(x, new Set());
  return out;
}
// "merge #617 (COD-566) first", or a blocker without a PR yet; empty when nothing holds the PR back
const blockedText = (m, id) =>
  (m.prBlockers?.get(id) || [])
    .map((b) =>
      b.pr
        ? `merge ${prn(b.pr)} (${idLink(b.ticket)}) first`
        : `${idLink(b.ticket)} has no PR yet`
    )
    .join('; ');

function model() {
  const idx = issueIndex();
  const v = runs?.qv || null;
  const get = (id) => idx.get(id) || stub(id);
  const m = { all: openIssues(), runs, v, get };
  m.before = v ? v.table.before : [];
  m.plans = m.before.filter((x) => x.kind === 'plan');
  m.questions = m.before.filter((x) => x.kind !== 'plan');
  m.after = v ? v.table.after : [];
  // Open PRs in merge order: a ticket's PR waits for the open tickets it is blocked by in Linear
  const openPrs = m.after.filter((x) => x.kind === 'pr');
  const prByTicket = new Map(openPrs.map((x) => [x.ticket, x]));
  const blockersOf = (id) =>
    (details[id]?.blockedBy || []).filter((b) => {
      const i = idx.get(b);
      return i && !['completed', 'canceled'].includes(i.statusType);
    });
  m.prs = mergeOrder(openPrs, blockersOf);
  m.prBlockers = new Map(
    m.prs.map((x) => [
      x.ticket,
      blockersOf(x.ticket).map((b) => ({
        ticket: b,
        pr: prByTicket.has(b) ? prOf(b, prByTicket.get(b).pr) : null
      }))
    ])
  );
  // Which tickets have hand-offs comes from the queue view; which items are still open, from Linear directly
  m.handoffs = m.after
    .filter((x) => x.kind === 'handoffs')
    .map((x) =>
      liveHandoffs[x.ticket] ? { ...x, items: liveHandoffs[x.ticket] } : x
    )
    .filter((x) => x.items?.length);
  m.handoffItems = m.handoffs.reduce((n, x) => n + (x.items?.length || 0), 0);
  m.next = v ? v.next : [];
  m.parked = v ? v.parked : [];
  m.held = v ? v.held : { tickets: [], free: [] };
  m.limit = v ? v.limit : { used: 0, max: LIMIT };
  const slots = new Map();
  for (const x of m.prs)
    slots.set(x.ticket, {
      ticket: x.ticket,
      pr: x.pr,
      why: 'open PR, in review'
    });
  for (const p of m.parked)
    if (!slots.has(p.ticket))
      slots.set(p.ticket, {
        ticket: p.ticket,
        pr: p.pr,
        why: `PR waits on ${WAIT[p.wait] || p.wait}`
      });
  m.slots = [...slots.values()];
  m.session = v ? v.session : null;
  // Polling since its last heartbeat while the queue view, taken later, has work for it: wait.sh never woke it
  const s = m.session;
  const polled =
    s?.state === 'alive' &&
    s.detail === 'polling' &&
    s.lastSeen &&
    v?.at &&
    m.next.length
      ? (Date.parse(v.at) - Date.parse(s.lastSeen)) / 6e4
      : null;
  m.stuck = polled !== null && polled >= STUCK_MIN ? polled : null;
  const day = Date.now() - 864e5;
  // A problem counts until a later run goes well: an OK row, or an OK last-run line
  const okTimes = (runs?.rows || [])
    .filter((r) => !isProblem(r.outcome))
    .map((r) => runTime(r.when));
  if (runs?.last && !isProblem(runs.last.outcome))
    okTimes.push(runTime(runs.last.when));
  const lastOk = Math.max(0, ...okTimes);
  m.runProblems = (runs?.rows || []).filter(
    (r) =>
      isProblem(r.outcome) && runTime(r.when) >= day && runTime(r.when) > lastOk
  );
  m.lastRunAge = runs?.last
    ? (Date.now() - runTime(runs.last.when)) / 36e5
    : null;
  // Idle runs publish at most hourly, so a slow interval stretches what counts as silent
  m.staleHours = Math.max(
    STALE_HOURS,
    (2 * (runs?.job?.minutes || 0)) / 60 + 1
  );
  m.schedulerStale = m.lastRunAge === null || m.lastRunAge > m.staleHours;
  m.installStale = runs?.job?.install === 'stale';
  // The daily suggestion: an agent-idea ticket without an Agent label waits on Håkan's verdict
  const allIdeas = (ideas || []).filter(
    (i) => !(i.labels || []).some((l) => OTHER_REPOS.includes(l))
  );
  m.ideasPending = allIdeas
    .filter((i) => ideaVerdict(i) === 'to decide')
    .sort(byCreated);
  m.ideasAccepted = allIdeas
    .filter((i) => ideaVerdict(i) === 'accepted')
    .sort(byCreated)
    .reverse();
  m.ideasDiscarded = allIdeas
    .filter((i) => ideaVerdict(i) === 'discarded')
    .sort((a, b) =>
      String(b.canceledAt || '').localeCompare(String(a.canceledAt || ''))
    );
  m.suggested = runs?.suggested || null;
  return m;
}

// Previews: the overview each card shows before its sheet opens
const pvEmpty = (t) => `<p class="pv-empty">${t}</p>`;
const pvMore = (n) => (n > 0 ? `<p class="pv-more">+ ${n} more</p>` : '');
const tLink = (i) =>
  `<a class="t" href="${esc(i.url)}" target="_blank" rel="noopener"><span class="id">${esc(i.id)}</span>${esc(i.title)}</a>`;
function pvTickets(xs, max, sub = () => '', rank = false) {
  if (!xs.length) return '';
  return `<ul class="pv-list">${xs
    .slice(0, max)
    .map((x, n) => {
      const extra = sub(x);
      return `<li><span class="rank">${rank ? n + 1 : ''}</span>${tLink(x.i)}${extra ? `<span class="sub">${extra}</span>` : ''}</li>`;
    })
    .join('')}</ul>${pvMore(xs.length - max)}`;
}
const nextOf = (x) => (details[x.i.id]?.next ? txt(details[x.i.id].next) : '');
function progressOf(x) {
  const d = details[x.i.id];
  if (!d?.steps) return nextOf(x);
  return `<span class="meta"><span class="bar" aria-hidden="true"><i style="width:${Math.round((d.done / d.steps) * 100)}%"></i></span>${d.done}/${d.steps} steps</span>${d.next ? `<span>${txt(d.next)}</span>` : ''}`;
}
function loadMeter(m) {
  const n = m.limit.used,
    max = m.limit.max || LIMIT;
  return `<div class="meter" aria-hidden="true"><i style="width:${Math.min(100, (n / max) * 100)}%;background:var(${n >= max ? '--block' : n >= max - 1 ? '--wait' : '--ok'})"></i></div>`;
}

// Agent tickets closed per day over the last 30 days, the one trend on the page
const SHIP_DAYS = 30;
const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayLabel = (key) =>
  new Date(key + 'T12:00').toLocaleDateString([], {
    month: 'short',
    day: 'numeric'
  });
function shipped() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const days = [];
  for (let k = SHIP_DAYS - 1; k >= 0; k--)
    days.push({ key: dayKey(today.getTime() - k * 864e5), items: [] });
  const byKey = new Map(days.map((d) => [d.key, d]));
  for (const i of closed || []) {
    if (!i.completedAt || !(i.labels || []).some((l) => l.startsWith('agent:')))
      continue;
    if ((i.labels || []).some((l) => OTHER_REPOS.includes(l))) continue;
    byKey.get(dayKey(i.completedAt))?.items.push(i);
  }
  const total = days.reduce((n, d) => n + d.items.length, 0);
  const week = days.slice(-7).reduce((n, d) => n + d.items.length, 0);
  return { days, total, week };
}

// Both day charts share these insets, so "Spend per day" lines up under "Closed by the agent"
const PAD = { l: 38, r: 4, t: 8, b: 20 };

// Drawn after layout so text stays at its real size at every width
function drawChart(el) {
  if (el.dataset.chart === 'spend') return drawSpend(el);
  const { days } = shipped();
  const W = Math.max(240, el.clientWidth),
    H = Number(el.dataset.h) || 150;
  const padL = PAD.l,
    padR = PAD.r,
    padT = PAD.t,
    padB = PAD.b,
    plotH = H - padT - padB;
  const max = Math.max(2, ...days.map((d) => d.items.length));
  const band = (W - padL - padR) / days.length,
    bw = Math.max(3, Math.min(16, band - 2));
  const y = (v) => padT + plotH - (v / max) * plotH;
  const ticks = max % 2 === 0 ? [0, max / 2, max] : [0, max];
  let g = ticks
    .map(
      (t) =>
        `<line class="${t === 0 ? 'base' : 'grid'}" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${padL - 6}" y="${y(t) + 3}" text-anchor="end">${t}</text>`
    )
    .join('');
  days.forEach((d, n) => {
    const cx = padL + band * n + band / 2,
      x = cx - bw / 2;
    g += `<rect class="hit" data-day="${n}" x="${padL + band * n}" y="${padT}" width="${band}" height="${plotH}"/><rect class="hl" x="${padL + band * n}" y="${padT}" width="${band}" height="${plotH}"/>`;
    const v = d.items.length;
    if (v) {
      const top = y(v),
        h = padT + plotH - top,
        r = Math.min(4, h, bw / 2);
      g += `<path class="barm" d="M${x},${padT + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${padT + plotH} Z"/>`;
    }
    if ((days.length - 1 - n) % 7 === 0)
      g += `<text class="ax" x="${cx}" y="${H - 5}" text-anchor="middle">${dayLabel(d.key)}</text>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Agent tickets closed per day, last ${SHIP_DAYS} days">${g}</svg><div class="tip" hidden></div>`;
  const tip = el.querySelector('.tip');
  el.onmousemove = (e) => {
    const hit = e.target.closest?.('[data-day]');
    if (!hit) {
      tip.hidden = true;
      return;
    }
    const d = days[Number(hit.dataset.day)];
    const ids = d.items.map((i) => i.id).join(', ');
    tip.innerHTML = `<b>${d.items.length}</b> closed · ${esc(dayLabel(d.key))}${ids ? `<div class="muted">${esc(ids)}</div>` : ''}`;
    const box = el.getBoundingClientRect(),
      hb = hit.getBoundingClientRect();
    tip.style.left =
      Math.min(
        box.width - 60,
        Math.max(60, hb.left - box.left + hb.width / 2)
      ) + 'px';
    tip.style.top = Math.max(0, y(d.items.length) - 2) + 'px';
    tip.hidden = false;
  };
  el.onmouseleave = () => {
    tip.hidden = true;
  };
}
// ---------- Spend ----------

const usd = (n, dp = 0) =>
  n == null
    ? '?'
    : '$' +
      n.toLocaleString('en-US', {
        minimumFractionDigits: dp,
        maximumFractionDigits: dp
      });
const niceCeil = (v) => {
  const p = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= v);
};
const legendHTML = () =>
  `<div class="legend">${ROLES.map((r) => `<span><i class="seg-${r}" aria-hidden="true"></i>${r}</span>`).join('')}</div>`;

// The same 30 local days as shipped(), each with its cost per role; days the document lacks are zero
function spendDays() {
  const byDay = new Map((usage?.days || []).map((d) => [d.day, d]));
  return shipped().days.map(({ key }) => {
    const d = byDay.get(key);
    return {
      key,
      ...Object.fromEntries(ROLES.map((r) => [r, d?.[r] || 0])),
      total: d?.total ?? 0
    };
  });
}
function spendStats() {
  const days = spendDays();
  const sum = (xs) => xs.reduce((n, d) => n + d.total, 0);
  return { days, total: sum(days), week: sum(days.slice(-7)) };
}

function drawSpend(el) {
  const days = spendDays();
  const W = Math.max(240, el.clientWidth),
    H = Number(el.dataset.h) || 150;
  const plotH = H - PAD.t - PAD.b;
  const max = niceCeil(Math.max(10, ...days.map((d) => d.total)));
  const band = (W - PAD.l - PAD.r) / days.length,
    bw = Math.max(3, Math.min(16, band - 2));
  const y = (v) => PAD.t + plotH - (v / max) * plotH;
  let g = [0, max / 2, max]
    .map(
      (t) =>
        `<line class="${t === 0 ? 'base' : 'grid'}" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${PAD.l - 6}" y="${y(t) + 3}" text-anchor="end">${usd(t)}</text>`
    )
    .join('');
  days.forEach((d, n) => {
    const cx = PAD.l + band * n + band / 2,
      x = cx - bw / 2;
    g += `<rect class="hit" data-day="${n}" x="${PAD.l + band * n}" y="${PAD.t}" width="${band}" height="${plotH}"/><rect class="hl" x="${PAD.l + band * n}" y="${PAD.t}" width="${band}" height="${plotH}"/>`;
    // Segments bottom-up in role order, a 2px surface gap between them, the top one rounded
    const segs = ROLES.filter((r) => d[r] > 0);
    let base = PAD.t + plotH;
    segs.forEach((r, k) => {
      const h = (d[r] / max) * plotH,
        gap = k ? 2 : 0;
      const top = base - h,
        hh = h - gap;
      if (hh > 0.5) {
        if (k === segs.length - 1) {
          const rr = Math.min(4, hh, bw / 2),
            b = base - gap;
          g += `<path class="seg-${r}" d="M${x},${b} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + bw - rr} Q${x + bw},${top} ${x + bw},${top + rr} V${b} Z"/>`;
        } else
          g += `<rect class="seg-${r}" x="${x}" y="${top}" width="${bw}" height="${hh}"/>`;
      }
      base = top;
    });
    if ((days.length - 1 - n) % 7 === 0)
      g += `<text class="ax" x="${cx}" y="${H - 5}" text-anchor="middle">${dayLabel(d.key)}</text>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="API-equivalent spend per day by role, last ${SHIP_DAYS} days">${g}</svg><div class="tip" hidden></div>`;
  const tip = el.querySelector('.tip');
  el.onmousemove = (e) => {
    const hit = e.target.closest?.('[data-day]');
    if (!hit) {
      tip.hidden = true;
      return;
    }
    const d = days[Number(hit.dataset.day)];
    tip.innerHTML =
      `<b>${usd(d.total, 2)}</b> · ${esc(dayLabel(d.key))}` +
      ROLES.map(
        (r) =>
          `<div class="muted"><i class="sw seg-${r}"></i>${r} ${usd(d[r], 2)}</div>`
      ).join('');
    const box = el.getBoundingClientRect(),
      hb = hit.getBoundingClientRect();
    tip.style.left =
      Math.min(
        box.width - 70,
        Math.max(70, hb.left - box.left + hb.width / 2)
      ) + 'px';
    tip.style.top = Math.max(0, y(d.total) - 2) + 'px';
    tip.hidden = false;
  };
  el.onmouseleave = () => {
    tip.hidden = true;
  };
}

// Agent tickets closed in the window that have a usage row, most expensive first
function ticketCosts() {
  const cost = new Map((usage?.tickets || []).map((t) => [t.ticket, t]));
  return shipped()
    .days.flatMap((d) => d.items)
    .filter((i) => cost.has(i.id))
    .map((i) => ({ i, ...cost.get(i.id) }))
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
}
function hbarsHTML(rows, max) {
  const top = Math.max(1, ...rows.map((r) => r.total ?? 0));
  return `<div class="hbars">${rows
    .slice(0, max)
    .map((r) => {
      const title =
        `${r.i.id}: ` + ROLES.map((k) => `${k} ${usd(r[k], 2)}`).join(', ');
      return `<div class="hbar" title="${esc(title)}"><a class="id" href="${esc(r.i.url)}" target="_blank" rel="noopener">${esc(r.i.id)}</a>
      <span class="track" aria-hidden="true">${ROLES.filter((k) => r[k] > 0)
        .map(
          (k) => `<i class="seg-${k}" style="width:${(r[k] / top) * 100}%"></i>`
        )
        .join('')}</span>
      <b>${usd(r.total)}</b></div>`;
    })
    .join('')}</div>${pvMore(rows.length - max)}`;
}

const tableHTML = (head, rows) =>
  `<div class="tblwrap"><table class="tbl"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const mtok = (n) =>
  n >= 1e9
    ? (n / 1e9).toFixed(2) + 'B'
    : n >= 1e6
      ? (n / 1e6).toFixed(1) + 'M'
      : n >= 1e3
        ? Math.round(n / 1e3) + 'k'
        : String(n);
const noUsage = () =>
  empty(
    'No usage document yet. The scheduler writes <code>Agent queue: usage</code> at most once an hour once <code>cdwr agent install</code> has run with COD-533.'
  );

function renderSpend() {
  if (!usage) return noUsage();
  const s = spendStats();
  const tok = usage.models.reduce(
    (a, m) => ({
      input: a.input + m.input,
      output: a.output + m.output,
      cacheRead: a.cacheRead + m.cacheRead,
      cacheWrite: a.cacheWrite + m.cacheWrite
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  );
  const allTok = tok.input + tok.output + tok.cacheRead + tok.cacheWrite;
  const unattributed =
    usage.tickets.find((t) => t.ticket === 'unattributed')?.total || 0;
  const tc = ticketCosts();
  const perTicket = tc.length
    ? tc.reduce((n, r) => n + (r.total || 0), 0) / tc.length
    : null;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '–');
  return `<div class="pv-stats">
      <div><b>${usd(s.total)}</b><span>last ${SHIP_DAYS} days</span></div>
      <div><b>${usd(s.week)}</b><span>last 7 days</span></div>
      <div><b>${usd(perTicket)}</b><span>per closed ticket</span></div>
      <div><b>${pct(tok.cacheRead, allTok)}</b><span>of tokens are cache reads</span></div>
      <div><b>${pct(unattributed, usage.total)}</b><span>unattributed</span></div>
    </div>
    ${legendHTML()}
    <div class="chart" data-chart="spend" data-h="200"></div>
    <div class="group"><h3>By model</h3>${tableHTML(
      ['Model', 'Cost', 'Output', 'Cache read', 'Cache write', 'Input'],
      usage.models
        .slice()
        .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))
        .map((m) => [
          esc(m.model),
          usd(m.cost, 2),
          mtok(m.output),
          mtok(m.cacheRead),
          mtok(m.cacheWrite),
          mtok(m.input)
        ])
    )}</div>
    <div class="group"><h3>What moves it</h3><ul class="knobs">
      <li><b>Model per role</b><span>Fable 5.1 costs 2.5× Opus 5.5 per token; the orchestrator runs on whatever the session uses, the implementer on Sonnet.</span></li>
      <li><b>Session length</b><span>Every turn re-reads the conversation as cache reads, so a long session grows roughly with its square. <code>/clear</code> between tickets and compaction between steps cut it.</span></li>
      <li><b><code>AGENT_QUEUE_BUDGET_USD</code></b><span>Caps one planning run (default 5). A run that hits it shows as <code>cap</code> on the scheduler.</span></li>
      <li><b><code>AGENT_QUEUE_IMPLEMENT_BUDGET_USD</code> and the daily cap</b><span>A session the scheduler starts stops at $15, and these sessions stop launching for the day at $40 (<code>AGENT_QUEUE_IMPLEMENT_CAP_USD</code>).</span></li>
      <li><b>Run interval</b><span>Idle runs start no model, so the interval only matters when there's something to plan.</span></li>
    </ul></div>
    <div class="group"><h3>Per day</h3>${tableHTML(
      ['Day', ...ROLES, 'Total'],
      spendDays()
        .filter((d) => d.total)
        .reverse()
        .map((d) => [
          esc(dayLabel(d.key)),
          ...ROLES.map((r) => usd(d[r], 2)),
          usd(d.total, 2)
        ])
    )}</div>
    <p class="rule">API-equivalent cost of the local Claude Code transcripts of this repo and its worktrees, at prices from ${esc(usage.pricesDate)}. Nothing is billed on Max; the cost is the weight the allowance follows. Planning is the scheduled planner; implementing is subagents; orchestrating is every other session. Planning runs on <code>origin/main</code>, so its cost is never tied to a ticket.${usage.unpriced.length ? ` Not priced, left out: ${esc(usage.unpriced.join(', '))}.` : ''} Updated ${esc(usage.updated)}.</p>`;
}

function renderTicketCost() {
  if (!usage) return noUsage();
  const rows = ticketCosts();
  return `${legendHTML()}${rows.length ? hbarsHTML(rows, rows.length) : empty('No agent ticket closed in the last ' + SHIP_DAYS + ' days has usage recorded.')}
    <div class="group"><h3>Every ticket with usage</h3>${tableHTML(
      ['Ticket', ...ROLES, 'Total', 'Output', 'Cache read'],
      usage.tickets.map((t) => [
        txt(t.ticket),
        ...ROLES.map((r) => usd(t[r], 2)),
        usd(t.total, 2),
        mtok(t.output),
        mtok(t.cacheRead)
      ])
    )}</div>
    <p class="rule">Closed agent tickets from the last ${SHIP_DAYS} days, by the API-equivalent cost of sessions on their branch over the last ${usage.windowDays} days. Work before that window isn't counted.</p>`;
}

function drawCharts() {
  document.querySelectorAll('[data-chart]').forEach(drawChart);
}
let chartWidth = 0;
try {
  new ResizeObserver(() => {
    const w = $('sheet-body').clientWidth;
    if (w && w !== chartWidth) {
      chartWidth = w;
      drawCharts();
    }
  }).observe($('sheet-body'));
} catch {}

function renderShipped() {
  const s = shipped();
  const daysWith = s.days.filter((d) => d.items.length).reverse();
  const listHTML = daysWith
    .map(
      (d) =>
        `<div class="group"><h3>${esc(dayLabel(d.key))} · ${d.items.length}</h3><ul>${d.items.map((i) => itemHTML(i, { state: 'plain' })).join('')}</ul></div>`
    )
    .join('');
  return `<div class="pv-stats"><div><b>${s.total}</b><span>last ${SHIP_DAYS} days</span></div><div><b>${s.week}</b><span>last 7 days</span></div></div>
    <div class="chart" data-chart data-h="200"></div>
    ${listHTML || empty('No agent ticket closed in the last ' + SHIP_DAYS + ' days.')}
    <p class="rule">Tickets that carried an agent label when they closed, by the day they closed.</p>`;
}

// ---------- Activity ----------

const NO_ACTIVITY =
  'No activity yet. The scheduler publishes it after its next run.';
const actorHTML = (a) =>
  a === 'agent'
    ? `<span class="tag agent"><img class="av" src="${AGENT_AVATAR}" alt="">agent</span>`
    : a === 'scheduler'
      ? `<span class="tag ${a}">${a}</span>`
      : a === 'unknown'
        ? `<span class="actor-unknown">unknown</span>`
        : esc(a);
const ticketHTML = (t) =>
  /^[A-Z]+-\d+$/.test(t)
    ? `<a class="id" href="${LINEAR_ISSUE + t}" target="_blank" rel="noopener">${esc(t)}</a>`
    : `<span class="id">${esc(t || '—')}</span>`;
const changeHTML = (c) => inline(String(c).replace(/\*\*/g, ''));
function activityTable(rows, compact) {
  return `<div class="tblwrap"><table class="act"><thead><tr><th>When</th><th>Ticket</th><th>Actor</th><th>Change</th></tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr><td><time>${esc(compact && r.when.slice(0, 10) === dayKey(Date.now()) ? r.when.slice(11) : r.when)}</time></td><td>${ticketHTML(r.ticket)}</td><td>${actorHTML(r.actor)}</td><td>${changeHTML(r.change)}</td></tr>`
    )
    .join('')}</tbody></table></div>`;
}
// The Updated line, in the warning colour once it's older than ACTIVITY_STALE_MIN: the scheduler stops while the Mac sleeps
function activityHead() {
  const age = activityAge();
  const stale = age !== null && age > ACTIVITY_STALE_MIN;
  return `<span class="${stale ? 'stale' : ''}" title="${stale ? "The scheduler hasn't published for " + esc(ageText(age)) + '. It stops while the Mac sleeps.' : ''}">${esc(activity.header)}</span>`;
}
const activityDay = () =>
  (activity?.rows || []).filter((r) => Date.now() - runTime(r.when) <= 864e5)
    .length;

function renderActivity() {
  if (!activity) return empty("The activity document hasn't loaded yet.");
  if (activity.missing) return empty(NO_ACTIVITY);
  const tickets = [
    ...new Set(
      activity.rows.map((r) => r.ticket).filter((t) => /^[A-Z]+-\d+$/.test(t))
    )
  ].sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  if (actFilter !== 'all' && !tickets.includes(actFilter)) actFilter = 'all';
  const rows =
    actFilter === 'all'
      ? activity.rows
      : activity.rows.filter((r) => r.ticket === actFilter);
  return `<div class="act-bar"><label>Ticket <select data-af aria-label="Filter by ticket"><option value="all"${actFilter === 'all' ? ' selected' : ''}>All</option>${tickets.map((t) => `<option value="${esc(t)}"${t === actFilter ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label><span>${plural(rows.length, 'event', 'events')}</span></div>
    ${activity.dropped ? `<p class="rule">${esc(activity.dropped)}</p>` : ''}
    ${rows.length ? activityTable(rows, false) : empty('No events for this ticket in the window.')}
    <p class="rule">From Linear's issue history of tickets that carried an <code>agent:*</code> label, and the scheduler's own runs. The agent and Håkan write through the same Linear account, so only comments starting <code>**Agent</code> say <b>agent</b>; other changes from that account carry its name. Updated ${activityHead()}.</p>`;
}

// ---------- Main view ----------

const prOf = (id, known) => known || details[id]?.pr || null;
const prn = (n) =>
  n
    ? `<a class="prn" href="${GH_PR + n}" target="_blank" rel="noopener" title="Pull request ${esc(n)}">#${esc(n)}</a>`
    : '';
const side = (n, chip) => `<span class="side2">${prn(n)}${chip}</span>`;
const pr = (n) =>
  n
    ? `<a class="id" href="${GH_PR + n}" target="_blank" rel="noopener">#${esc(n)}</a>`
    : '';
const idLink = (id) =>
  `<a class="id" href="${LINEAR_ISSUE + esc(id)}" target="_blank" rel="noopener">${esc(id)}</a>`;
const titled = (m, id) => {
  const i = m.get(id);
  return `<a class="t" href="${esc(i.url)}" target="_blank" rel="noopener"><span class="id">${esc(id)}</span>${esc(i.title)}</a>`;
};
const SESSION = {
  alive: 'Session live',
  waiting: 'Session waits on you',
  stopped: 'Session stopped',
  none: 'No session'
};
const REASON = {
  resume: ['resume', 'resume'],
  'take over': ['take over', 'takeover'],
  answered: ['answered', 'answered'],
  'review feedback': ['review feedback', 'feedback'],
  ready: ['ready', 'ready']
};
const reasonChip = (r) => {
  const [t, c] = REASON[r] || [r, 'resume'];
  return `<span class="chip ${c}">${esc(t)}</span>`;
};
const WAIT = { ci: 'CI', copilot: 'Copilot review' };
const nextAt = (m) => (nextRun(m) ? hhmm(nextRun(m)) : 'its next run');
const WHY = {
  answered: 'Your reply is in.',
  'review feedback': 'Its PR has review comments to address.',
  'take over': 'Its claim went stale.',
  resume: '',
  ready: ''
};
// Who takes a queued item and when: the live session, or the scheduler on its next run
function whyLine(m, x) {
  const s = m.session || { state: 'none' };
  const live = s.state === 'alive' || s.state === 'waiting';
  const who =
    m.stuck !== null
      ? 'The live session should have taken it; it is stuck polling.'
      : live
        ? s.ticket === x.ticket
          ? 'The live session is on it.'
          : 'The live session takes it after its current step.'
        : x.reason === 'ready'
          ? `The scheduler plans it at ${nextAt(m)}.`
          : `The scheduler starts a session for it at ${nextAt(m)}.`;
  return [WHY[x.reason] || '', who, x.detail ? inline(x.detail) : '']
    .filter(Boolean)
    .join(' ');
}
const parkedText = (p) =>
  p.resolved
    ? `${WAIT[p.wait] || p.wait} ${esc(p.outcome || 'done')}, resumes next`
    : `waits on ${WAIT[p.wait] || esc(p.wait)}`;
const seenAgo = (iso) =>
  iso ? ageText((Date.now() - Date.parse(iso)) / 6e4) : '';
const span = (min) =>
  min < 60
    ? `${Math.round(min)} min`
    : `${Math.floor(min / 60)} h ${Math.round(min % 60)} min`;

// One sentence for what happens next, from the session and the head of the queue
function headline(m) {
  const v = m.v;
  if (!runs) return { tone: '', text: 'Loading the runs document…', note: '' };
  if (!v)
    return {
      tone: 'wait',
      text: 'The runs document has no queue view yet. Run <code>cdwr agent install</code> from main.',
      note: ''
    };
  const s = m.session || { state: 'none' };
  const first = m.next[0];
  const when = nextRun(m) ? '~' + hhmm(nextRun(m)) : 'its next run';
  const on = s.ticket ? ' on ' + idLink(s.ticket) : '';
  let tone = '',
    text;
  if (s.state === 'waiting') {
    tone = 'wait';
    text = `The session${on} waits on a prompt in your terminal.`;
  } else if (m.stuck !== null) {
    tone = 'block';
    text = `The session has polled for ${span(m.stuck)} while ${idLink(first.ticket)} (${esc(first.reason)}) waits. Its wait missed it: type anything in its terminal.`;
  } else if (s.state === 'alive') {
    text = `A session is ${s.detail === 'polling' ? 'polling for changes' : 'working'}${on}.`;
    if (first)
      text += ` It takes ${idLink(first.ticket)} next (${esc(first.reason)}).`;
  } else if (first) {
    text =
      first.reason === 'ready'
        ? `No session is running. The scheduler plans ${idLink(first.ticket)} at ${when}.`
        : `No session is running. The scheduler starts one for ${idLink(first.ticket)} (${esc(first.reason)}) at ${when}, unless today's cap or the back-off holds it.`;
  } else {
    const yours = m.before.length + m.prs.length + m.ideasPending.length;
    tone = m.before.length || m.ideasPending.length ? 'wait' : '';
    const first = m.before.length
      ? idLink(m.before[0].ticket)
      : m.ideasPending.length
        ? 'the idea ' + idLink(m.ideasPending[0].id)
        : '';
    text = yours
      ? `Nothing for the agent. ${plural(yours, 'thing waits', 'things wait')} on you${first ? ', starting with ' + first : ''}.`
      : 'Nothing for the agent, and nothing waits on you.';
  }
  const parked = m.parked
    .map(
      (p) =>
        `${idLink(p.ticket)} ${parkedText(p)}${p.pr ? ' on ' + pr(p.pr) : ''}`
    )
    .join(' · ');
  const age = runs.last ? (Date.now() - runTime(runs.last.when)) / 6e4 : null;
  const asOf = runs.last
    ? `Snapshot from the scheduler run at ${esc(runs.last.when.slice(11))}, ${esc(ageText(age))}. A live session can be ahead of it`
    : '';
  const seen =
    s.lastSeen && s.state !== 'none'
      ? `session seen ${esc(seenAgo(s.lastSeen))}`
      : '';
  return {
    tone,
    text,
    note: [parked, [asOf, seen].filter(Boolean).join(', ')]
      .filter(Boolean)
      .join(' · ')
  };
}

function renderNow(m) {
  const h = headline(m);
  const s = m.session || { state: 'none' };
  const sched = !runs
    ? '–'
    : m.schedulerStale
      ? `silent ${Math.floor(m.lastRunAge ?? 0)} h`
      : m.installStale
        ? runs?.job?.host === 'container'
          ? 'image out of date'
          : 'install out of date'
        : m.runProblems.length
          ? plural(m.runProblems.length, 'problem', 'problems')
          : 'OK';
  const bad =
    runs && (m.schedulerStale || m.installStale || m.runProblems.length);
  $('now').className = 'now ' + (bad && !h.tone ? 'block' : h.tone);
  $('now').innerHTML =
    `<button type="button" class="pill ${esc(s.state)}${m.stuck !== null ? ' stuck' : ''}" data-w="session" aria-haspopup="dialog"><i aria-hidden="true"></i>${m.stuck !== null ? 'Session stuck' : esc(SESSION[s.state] || s.state)}${s.state !== 'none' && s.detail ? ` · ${esc(s.detail)}` : ''}</button>
    <div class="headline"><p>${h.text}</p>${h.note ? `<small>${h.note}</small>` : ''}</div>
    <button type="button" class="gauge" data-w="limit" aria-haspopup="dialog"><span class="k">Limit · agent PRs in flight</span><b>${m.limit.used} <small>of ${m.limit.max} · ${m.limit.used >= m.limit.max ? 'no new ticket starts' : plural(m.limit.max - m.limit.used, 'slot', 'slots') + ' free'}</small></b>${loadMeter(m)}</button>
    <button type="button" class="gauge" data-w="scheduler" aria-haspopup="dialog"><span class="k">Scheduler</span><b>${esc(sched)}</b><small style="color:var(--muted);font-size:.78rem">${runs?.last ? 'last ' + esc(runs.last.when.slice(11)) + ' · next ' + (nextRun(m) ? hhmm(nextRun(m)) : '?') : 'no runs yet'}${runs?.job?.host ? '<br>' + esc(HOST[runs.job.host]) + (runs.job.rev ? ' · ' + esc(runs.job.rev) : '') : ''}</small></button>`;
}

function rowsHTML(items, none) {
  if (!items.length) return `<p class="none">${none}</p>`;
  const shown = items.slice(0, ROWS);
  return `<ul class="rows">${shown.join('')}${items.length > ROWS ? `<li class="more-line">+ ${items.length - ROWS} more</li>` : ''}</ul>`;
}
function groupedRows(groups, none) {
  const live = groups.filter((g) => g.items.length);
  if (!live.length) return `<p class="none">${none}</p>`;
  const out = [];
  let left = ROWS,
    hidden = 0;
  for (const g of live) {
    const shown = g.items.slice(0, Math.max(0, left));
    hidden += g.items.length - shown.length;
    if (!shown.length) continue;
    if (live.length > 1)
      out.push(`<li class="grp">${esc(g.label)} · ${g.items.length}</li>`);
    out.push(...shown);
    left -= shown.length;
  }
  return `<ul class="rows">${out.join('')}${hidden ? `<li class="more-line">+ ${hidden} more</li>` : ''}</ul>`;
}
function colHTML(k, title, count, body) {
  return `<div class="col-head"><span class="k">${k}</span><button type="button" class="open" aria-haspopup="dialog">${esc(title)}</button><span class="count">${count}</span></div>${body}`;
}

function renderCols(m) {
  const loading = !runs;
  const before = [
    ...m.before.map(
      (x) =>
        `<li>${titled(m, x.ticket)}<span class="chip ${x.kind === 'plan' ? 'plan' : 'question'}">${x.kind === 'plan' ? 'plan' : 'question'}</span></li>`
    ),
    ...m.ideasPending.map(
      (i) =>
        `<li>${tLink(i)}<span class="chip idea">idea</span><span class="s">Accept with <code>agent:ready</code>, or cancel with one word</span></li>`
    )
  ];
  $('col-before').classList.toggle('has', before.length > 0);
  $('col-before').innerHTML = colHTML(
    'Before the agent can build',
    'Waiting on you',
    loading ? '–' : before.length,
    loading
      ? `<p class="none">Loading…</p>`
      : rowsHTML(before, 'No plan, question or idea waits for you.')
  );

  const next = [
    ...m.next.map(
      (x) =>
        `<li>${titled(m, x.ticket)}${side(prOf(x.ticket), reasonChip(x.reason))}<span class="s">${whyLine(m, x)}</span></li>`
    ),
    ...m.parked.map(
      (p) =>
        `<li>${titled(m, p.ticket)}${side(prOf(p.ticket, p.pr), '<span class="chip parked">parked</span>')}<span class="s">${parkedText(p)}${p.since ? ' since ' + hhmm(Date.parse(p.since)) : ''}${p.resolved ? '' : '. It resumes when that finishes.'}</span></li>`
    ),
    ...(m.held.tickets.length
      ? [
          `<li><span class="t">${m.held.tickets.map(esc).join(', ')}</span><span class="chip held">held</span><span class="s">The limit holds ${plural(m.held.tickets.length, 'ready ticket', 'ready tickets')}; review an open PR to free a slot</span></li>`
        ]
      : [])
  ];
  $('col-next').innerHTML = colHTML(
    'The agent',
    'Takes next',
    loading ? '–' : m.next.length,
    loading
      ? `<p class="none">Loading…</p>`
      : rowsHTML(
          next,
          'Nothing to take. Add <code>agent:ready</code> to a ticket in Linear.'
        )
  );

  const open = m.prs.map((x) => {
    const held = blockedText(m, x.ticket);
    return `<li>${titled(m, x.ticket)}${side(prOf(x.ticket, x.pr), held ? '<span class="chip blocked">merge later</span>' : '<span class="chip pr">review</span>')}${held ? `<span class="s">${held}</span>` : ''}</li>`;
  });
  const merged = m.handoffs.map(
    (x) =>
      `<li>${titled(m, x.ticket)}${side(prOf(x.ticket), `<span class="chip handoffs">${plural(x.items?.length || 0, 'check', 'checks')}</span>`)}${x.items?.[0] ? `<span class="s">${inline(x.items[0])}</span>` : ''}</li>`
  );
  $('col-after').innerHTML = colHTML(
    'After the agent built',
    'Review and check',
    loading ? '–' : m.prs.length + m.handoffItems,
    loading
      ? `<p class="none">Loading…</p>`
      : groupedRows(
          [
            { label: 'Open PRs', items: open },
            { label: 'Merged, hand-offs left', items: merged }
          ],
          'No PR to review and no hand-off left.'
        )
  );
}

function renderMore(m) {
  const loaded = STATES.some((s) => buckets[s]);
  const tiles = [
    [
      'activity',
      'activity',
      'Activity, 24 h',
      activity && !activity.missing
        ? plural(activityDay(), 'event', 'events')
        : '–'
    ],
    [
      'shipped',
      'bars',
      'Closed, 30 days',
      loaded || closed ? String(shipped().total) : '–'
    ],
    ['spend', 'coin', 'Spend, 30 days', usage ? usd(spendStats().total) : '–'],
    [
      'ticketcost',
      'ticket',
      'Per closed ticket',
      (() => {
        const r = ticketCosts();
        return r.length
          ? usd(r.reduce((n, x) => n + (x.total || 0), 0) / r.length)
          : '–';
      })()
    ],
    ['ideas', 'bulb', 'Suggestion, daily', ...ideaTile(m)],
    ['all', 'all', 'Open tickets', loaded ? String(m.all.length) : '–'],
    [
      'timers',
      'timer',
      'Next scheduler run',
      nextRun(m) ? '~' + hhmm(nextRun(m)) : '–'
    ]
  ];
  $('more').innerHTML = tiles
    .map(
      ([id, ic, label, value, bad]) =>
        `<button type="button" class="mini${bad ? ' bad' : ''}" data-w="${id}" aria-haspopup="dialog"><span class="ico">${icon(ic)}</span><span>${esc(label)}</span><b>${esc(value)}</b></button>`
    )
    .join('');
}

// The tile's value and whether it's a problem: an idea to decide first, else what the last suggest run did
function ideaTile(m) {
  if (m.ideasPending.length)
    return [plural(m.ideasPending.length, 'to decide', 'to decide')];
  const s = m.suggested;
  if (!s) return [ideas ? 'none yet' : '–'];
  const day = s.date === dayKey(Date.now()) ? 'today' : dayLabel(s.date);
  if (s.kind === 'suggested') {
    const i = (ideas || []).find((x) => x.id === s.ticket);
    return [i ? `${s.ticket} ${ideaVerdict(i)}` : s.ticket];
  }
  if (s.kind === 'nothing') return [`nothing ${day}`];
  if (s.kind === 'open') return [`${s.ticket} to decide`];
  return [`${s.text}, ${day}`, true];
}

function renderMain() {
  const m = model();
  renderNow(m);
  renderCols(m);
  renderMore(m);
}

// ---------- Sheets: one per column, gauge and tile ----------

const SHEETS = [
  {
    id: 'before',
    title: 'Waiting on you before the agent can build',
    sub: "Plans to approve and questions to answer. Reply in the ticket's newest Agent comment.",
    body: renderBefore
  },
  {
    id: 'next',
    title: 'What the agent takes next',
    sub: "In the order a session takes them, from the scheduler's queue view",
    body: renderNext
  },
  {
    id: 'after',
    title: 'Review and check',
    sub: "Open agent PRs, and unticked hand-offs from each ticket's latest Agent: PR ready comment. Tick them in Linear.",
    body: renderHandoffs
  },
  {
    id: 'session',
    title: 'Session',
    sub: "The work-queue session's heartbeat, and how the next step is decided",
    body: renderAttended
  },
  {
    id: 'limit',
    title: 'Limit',
    sub: "Agent PRs in flight count: open reviews and tickets parked on their PR's checks. At the limit no new ticket starts; answers, reviews and parked work still resume.",
    body: renderLoad
  },
  {
    id: 'scheduler',
    title: 'Scheduler',
    sub: 'The scheduled runs, from the Agent queue: runs document',
    body: renderScheduler
  },
  {
    id: 'timers',
    title: 'Timers',
    sub: "Every interval, window and timeout the queue runs on, and where it's set",
    body: renderTimers
  },
  {
    id: 'activity',
    title: 'Activity',
    sub: "Every status, label, description and comment change on agent tickets, plus the scheduler's runs, newest first",
    body: renderActivity
  },
  {
    id: 'shipped',
    title: 'Closed by the agent',
    sub: `Agent tickets closed per day, last ${SHIP_DAYS} days`,
    body: renderShipped
  },
  {
    id: 'spend',
    title: 'Spend per day',
    sub: `API-equivalent spend per day by role, last ${SHIP_DAYS} days, from the Agent queue: usage document`,
    body: renderSpend
  },
  {
    id: 'ticketcost',
    title: 'Cost per closed ticket',
    sub: "Agent tickets closed in the last 30 days, by what their branch's sessions cost",
    body: renderTicketCost
  },
  {
    id: 'all',
    title: 'All open tickets',
    sub: 'Same order as the agent: status, priority, then age',
    body: renderAll
  },
  {
    id: 'ideas',
    title: 'Agent suggestions',
    sub: 'One evidence-led idea a day, from the first idle run after 06:00. Accept it with agent:ready; discard it by cancelling with one word in a comment.',
    body: renderIdeas
  }
];

// ---------- Sheet bodies ----------

const empty = (t) => `<div class="empty">${t}</div>`;

function itemHTML(i, opts = {}) {
  const d = details[i.id];
  const prog =
    d && d.steps
      ? `<div class="meta"><div class="bar" aria-hidden="true"><i style="width:${Math.round((d.done / d.steps) * 100)}%"></i></div><span>${d.done}/${d.steps} steps</span></div>`
      : '';
  const next = opts.note
    ? `<div class="meta">${opts.note}</div>`
    : d?.next && opts.showNext
      ? `<div class="next">${txt(d.next)}</div>`
      : '';
  const blockers = opts.blockers?.length
    ? `<span class="chip blocked">blocked by ${opts.blockers.map(txt).join(', ')}</span>`
    : '';
  return `<li class="item ${opts.state || ''}">
    <span class="rank">${esc(opts.rank ?? '')}</span>
    <div class="main">
      <a class="title" href="${esc(i.url)}" target="_blank" rel="noopener"><span class="id">${esc(i.id)}</span>${esc(i.title)}</a>
      ${i.status ? `<div class="meta"><span class="prio" title="${PRIO[i.priority?.value ?? 0]}">${PRIO_MARK[i.priority?.value ?? 0]} ${PRIO[i.priority?.value ?? 0]}</span><span>· ${esc(i.status)}</span>${blockers}</div>` : ''}
      ${prog}${next}
    </div>
    <span class="side">${opts.side ?? ''}</span>
  </li>`;
}

function renderBefore(m) {
  if (!m.v) return empty('No queue view yet.');
  const group = (h, xs, state) =>
    xs.length
      ? `<div class="group"><h3>${h} · ${xs.length}</h3><ul>${xs.map((x) => itemHTML(m.get(x.ticket), { state, showNext: true })).join('')}</ul></div>`
      : '';
  const ideasHTML = m.ideasPending.length
    ? `<div class="group"><h3>Ideas to decide · ${m.ideasPending.length}</h3>${m.ideasPending.map((i) => ideaCard(i)).join('')}</div>`
    : '';
  return (
    group('Plans to approve', m.plans, 'needs-input') +
      group('Questions', m.questions, 'needs-input') +
      ideasHTML || empty('No plan, question or idea waits for you.')
  );
}

// ---------- Suggestions ----------

function ideaCard(i) {
  const d = details[i.id]?.idea;
  const when = new Date(i.createdAt).toLocaleDateString([], {
    month: 'short',
    day: 'numeric'
  });
  const part = (h, html) => (html ? `<div><h4>${h}</h4>${html}</div>` : '');
  const body = details[i.id]
    ? d
      ? part(
          'Evidence',
          d.evidence.length
            ? `<ul>${d.evidence.map((e) => `<li>${inline(e)}</li>`).join('')}</ul>`
            : ''
        ) +
        part('What changes', d.change ? `<p>${inline(d.change)}</p>` : '') +
        part('Cost', d.cost ? `<p>${inline(d.cost)}</p>` : '') +
        part('Why now', d.why ? `<p>${inline(d.why)}</p>` : '')
      : `<p class="rule">The ticket doesn't follow the suggestion shape; read it in Linear.</p>`
    : `<p class="rule">Loading the ticket…</p>`;
  return `<article class="idea">
    <a class="title" href="${esc(i.url)}" target="_blank" rel="noopener"><span class="id">${esc(i.id)}</span>${esc(i.title)}</a>
    <div class="meta"><span>suggested ${esc(when)}</span>${d?.focus ? `<span>· ${esc(d.focus)}</span>` : ''}</div>
    ${body}
    <p class="rule">Accept: set <code>agent:ready</code> on the ticket. Discard: cancel it with one word in a comment, such as <i>already decided</i>, <i>not worth it</i>, <i>wrong direction</i> or <i>later</i>. The agent reads the word before its next idea.</p>
  </article>`;
}

function renderIdeas(m) {
  if (!ideas)
    return empty(
      errors['ideas']
        ? "The suggestions couldn't load from Linear."
        : 'Loading the suggestions…'
    );
  const s = m.suggested;
  const lastText = !s
    ? 'No <code>Suggested:</code> line in the runs document yet. The first idle run after 06:00 writes it, once <code>cdwr agent install</code> has run with COD-579.'
    : s.kind === 'suggested'
      ? `${esc(s.date)} · suggested ${idLink(s.ticket)} ${esc(s.title)}`
      : s.kind === 'open'
        ? `${esc(s.date)} · ${idLink(s.ticket)} still waits on your verdict, so no new idea`
        : `${esc(s.date)} · ${esc(s.text)}`;
  const last = `<div class="group"><h3>Last suggest run</h3><div class="${s && ['cap', 'failed', 'other'].includes(s.kind) ? 'empty' : 'rule'}">${lastText}</div></div>`;
  const pending = m.ideasPending.length
    ? `<div class="group"><h3>To decide · ${m.ideasPending.length}</h3>${m.ideasPending.map((i) => ideaCard(i)).join('')}</div>`
    : `<div class="group"><h3>To decide</h3>${empty('Nothing to decide. The next idea comes in the first idle run after 06:00, and only when the agent found evidence for one.')}</div>`;
  const stateChip = (i) =>
    agentState(i)
      ? `<span class="chip ${agentState(i)}">${agentState(i)}</span>`
      : '<span class="chip ready">done</span>';
  const accepted = m.ideasAccepted.length
    ? `<div class="group"><h3>Accepted · ${m.ideasAccepted.length}</h3><ul>${m.ideasAccepted
        .map((i) =>
          itemHTML(i, { state: agentState(i) || 'ready', side: stateChip(i) })
        )
        .join('')}</ul></div>`
    : '';
  const discarded = m.ideasDiscarded.length
    ? `<div class="group"><h3>Discarded · ${m.ideasDiscarded.length}</h3><ul>${m.ideasDiscarded
        .map((i) =>
          itemHTML(i, {
            state: 'plain',
            side: i.canceledAt ? esc(dayLabel(i.canceledAt.slice(0, 10))) : '',
            note:
              i.id in ideaReasons
                ? ideaReasons[i.id]
                  ? `<span class="reason">“${esc(ideaReasons[i.id])}”</span>`
                  : `<span class="reason">no reason given</span>`
                : ''
          })
        )
        .join('')}</ul></div>`
    : '';
  const month = Date.now() - 30 * 864e5;
  const recent = (xs, at) =>
    xs.filter((i) => Date.parse(at(i) || i.createdAt) >= month).length;
  const notWorth = m.ideasDiscarded.filter(
    (i) =>
      Date.parse(i.canceledAt || i.createdAt) >= month &&
      /not worth/i.test(ideaReasons[i.id] || '')
  ).length;
  const stats = `<div class="pv-stats"><div><b>${recent(m.ideasAccepted, (i) => i.completedAt)}</b><span>accepted, 30 days</span></div><div><b>${recent(m.ideasDiscarded, (i) => i.canceledAt)}</b><span>discarded, 30 days</span></div><div><b>${notWorth}</b><span>of them "not worth it"</span></div></div>`;
  return (
    last +
    pending +
    stats +
    accepted +
    discarded +
    `<p class="rule">Tickets with the <code>Source: agent-idea</code> label from the last 60 days. The scheduler proposes nothing while one waits on your verdict. From 2026-11-16 the skill reviews the month: more than half discarded as "not worth it" and its one idea of the day is to go weekly.</p>`
  );
}

function renderNext(m) {
  if (!m.v) return empty('No queue view yet.');
  const next = m.next.length
    ? `<ol>${m.next.map((x, n) => itemHTML(m.get(x.ticket), { state: x.reason === 'ready' ? 'ready' : x.reason === 'answered' ? 'answered' : x.reason === 'review feedback' ? 'review' : 'working', rank: n + 1, side: `${prn(prOf(x.ticket))} ${reasonChip(x.reason)}`, note: whyLine(m, x) })).join('')}</ol>`
    : empty(
        'Nothing to take. In Linear, add <code>agent:ready</code> to a ticket as the last step of refining it.'
      );
  const parked = m.parked.length
    ? `<div class="group"><h3>Parked on a wait · ${m.parked.length}</h3><ul>${m.parked.map((p) => itemHTML(m.get(p.ticket), { state: 'working', side: `${prn(prOf(p.ticket, p.pr))} <span class="chip parked">${esc(WAIT[p.wait] || p.wait)}</span>`, note: `${parkedText(p)}${p.pr ? ' for #' + esc(p.pr) : ''}, since ${p.since ? hhmm(Date.parse(p.since)) : '?'}. It resumes when that finishes.` })).join('')}</ul></div>`
    : '';
  const held = m.held.tickets.length
    ? `<div class="group"><h3>Held by the limit · ${m.held.tickets.length}</h3><ul>${m.held.tickets.map((id) => itemHTML(m.get(id), { state: 'plain', side: '<span class="chip held">held</span>' })).join('')}</ul>${freeHTML(m)}</div>`
    : '';
  return `<div class="group"><h3>Next · ${m.next.length}</h3>${next}</div>${parked}${held}
    <p class="rule">A session resumes its own work first, then takes over stale claims, answered tickets and review feedback, then new <code>agent:ready</code> tickets while the limit has room. A ticket parked on CI or a Copilot review resumes when the wait resolves. With no session alive, the scheduler starts one for anything but a new ready ticket, which it plans itself.</p>`;
}

function freeHTML(m) {
  if (!m.held.free?.length) return '';
  return `<ul class="knobs">${m.held.free
    .map((f) =>
      f.action === 'review'
        ? `<li><b>Review ${f.pr ? '#' + esc(f.pr) : esc(f.ticket)}</b><span>Merging or closing ${esc(f.ticket)} frees a slot</span></li>`
        : f.action === 'wait'
          ? `<li><b>${esc(f.ticket)} waits on ${f.pr ? '#' + esc(f.pr) : 'its PR'}</b><span>Its slot frees when that PR merges or closes</span></li>`
          : `<li><b>Run with <code>limit=${esc(f.value)}</code></b><span>Raises the limit for that session only</span></li>`
    )
    .join('')}</ul>`;
}

function handoffCard(m, x) {
  const i = m.get(x.ticket);
  const when = i.completedAt
    ? 'closed ' +
      new Date(i.completedAt).toLocaleDateString([], {
        month: 'short',
        day: 'numeric'
      })
    : esc(i.status);
  return `<article class="ho">
    <a class="title" href="${esc(i.url)}" target="_blank" rel="noopener"><span class="id">${esc(i.id)}</span>${esc(i.title)}</a>
    <div class="meta">${when}${prOf(x.ticket) ? ' · ' + prn(prOf(x.ticket)) : ''}</div>
    <ul class="checks">${(x.items || []).map((t) => `<li><span>${inline(t)}</span></li>`).join('')}</ul>
  </article>`;
}

function renderHandoffs(m) {
  if (!m.v) return empty('No queue view yet.');
  const prs = m.prs.length
    ? `<div class="group"><h3>Open PRs · ${m.prs.length}</h3><ul>${m.prs
        .map((x, n) => {
          const held = blockedText(m, x.ticket);
          return itemHTML(m.get(x.ticket), {
            state: held ? 'blocked' : 'review',
            rank: m.prs.length > 1 ? n + 1 : '',
            showNext: true,
            note: held ? 'Merge order: ' + held : undefined,
            side: `${prn(prOf(x.ticket, x.pr))}${held ? ' <span class="chip blocked">merge later</span>' : ''}`
          });
        })
        .join('')}</ul></div>`
    : '';
  const ho = m.handoffs.length
    ? `<div class="group"><h3>Merged, hand-offs left · ${m.handoffItems}</h3>${m.handoffs.map((x) => handoffCard(m, x)).join('')}</div>`
    : '';
  return (
    (prs + ho || empty('No PR to review and no hand-off left.')) +
    `<p class="rule">Open PRs are numbered in merge order: a PR whose ticket is blocked by another open ticket in Linear comes after that ticket's PR, and is marked <i>merge later</i> until the blocker closes. Hand-offs come from agent tickets merged in the last 14 days. They don't count toward the limit. The heading must read exactly <code>Hand-off checklist:</code>.</p>`
  );
}

function renderLoad(m) {
  const max = m.limit.max || LIMIT;
  return `<div class="pv-stats"><div><b>${m.limit.used} of ${max}</b><span>agent PRs in flight</span></div><div><b>${m.held.tickets.length}</b><span>ready tickets held</span></div></div>${loadMeter(m)}
    <div class="group"><h3>Holding a slot · ${m.slots.length}</h3>${m.slots.length ? `<ul>${m.slots.map((x) => itemHTML(m.get(x.ticket), { state: 'review', side: prn(prOf(x.ticket, x.pr)), note: esc(x.why) })).join('')}</ul>` : empty('None.')}</div>
    ${m.held.tickets.length ? `<div class="group"><h3>Held · ${m.held.tickets.length}</h3><ul>${m.held.tickets.map((id) => itemHTML(m.get(id), { state: 'plain' })).join('')}</ul>${freeHTML(m)}</div>` : ''}
    <p class="rule">Each open <code>agent:review</code> PR counts one, and so does a ticket parked on its PR's CI or Copilot review, since its PR is already open. Hand-offs don't count. At ${max}, <code>/work-queue</code> stops starting new tickets but still resumes your answers, reviews and parked work. A session's <code>limit=N</code> isn't visible here, so the queue view's limit applies.</p>`;
}

// Runs keep launchd's grid from the last load, so step the last-run time forward by the interval.
// Sleep shifts the grid, hence "about".
const hhmm = (t) =>
  new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const runMinutes = (m) => m.runs?.job?.minutes || INSTALL_MINUTES;
function nextRun(m) {
  const min = runMinutes(m),
    last = m.runs?.last;
  if (!last) return null;
  const step = min * 6e4;
  let t = runTime(last.when) + step;
  if (t < Date.now()) t += Math.ceil((Date.now() - t) / step) * step;
  return t;
}

// Kept by hand in step with run.sh, the work-queue skill and agent.logic.ts; only the interval is read live
function timerGroups(m) {
  const min = m.runs?.job?.minutes;
  const assumed = min ? '' : ' (assumed: no Job line yet)';
  return [
    [
      'Scheduler (launchd, run.sh)',
      [
        [
          'Scheduled run',
          `every ${runMinutes(m)} min`,
          `launchd StartInterval, from RUN_INTERVAL_SECONDS in agent.logic.ts (600 s). The live value comes from the Job line${assumed}`
        ],
        [
          'First run after install',
          'one interval later',
          'RunAtLoad is off; cdwr agent run starts one now'
        ],
        [
          'Next run',
          nextRun(m) ? 'about ' + hhmm(nextRun(m)) : 'unknown',
          'last run plus whole intervals; sleep shifts it'
        ],
        [
          'Runs document, idle runs',
          'at most once an hour',
          'run.sh publish_runs; runs that did something publish at once'
        ],
        ['Runs document history', 'last 20 runs', 'run.sh trims runs.jsonl'],
        [
          'Usage document',
          'at most once an hour',
          "run.sh publish_usage runs `cdwr agent usage --days 30` from the planner's checkout"
        ],
        [
          'Activity document',
          'every run, when it changed',
          "run.sh publish_activity: 7 days, newest 200 events, rendered by `cdwr agent activity` from the planner's checkout"
        ],
        [
          'Queue view',
          'every run',
          'run.sh, watch.jq `queue_view`; a change republishes the runs document at once'
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
          'every 2 min',
          'ticket lists, the runs, usage and activity documents; Refresh forces it'
        ],
        [
          'Activity called stale',
          `after ${ACTIVITY_STALE_MIN} min`,
          'its Updated line turns the warning colour'
        ],
        [
          'Ticket details',
          'cached 60 s',
          'plan progress and Next lines in the sheets'
        ],
        [
          'Suggestions',
          'every 2 min',
          'agent-idea tickets of the last 60 days; the discard word of a cancelled one is its last comment, cached 10 min'
        ],
        [
          'Hand-off ticks',
          'with each refresh, cached 30 s',
          "read from the ticket's PR ready comment, ahead of the scheduler; a newly merged ticket still waits for its run"
        ],
        [
          'Session stuck',
          `polling ≥ ${STUCK_MIN} min with work queued`,
          "its last heartbeat to the queue view's time; the band turns red"
        ],
        [
          'Scheduler silent',
          `after ${m.staleHours ?? STALE_HOURS} h`,
          "2 h, or twice the interval plus an hour when that's longer"
        ],
        ['Run problems', 'last 24 h', 'until a later run goes well'],
        ['Titles of closed tickets', 'closed ≤ 30 days', 'CLOSED_WINDOW']
      ]
    ]
  ];
}

function renderTimers(m) {
  return timerGroups(m)
    .map(
      ([h, rows]) =>
        `<div class="group"><h3>${esc(h)}</h3><ul>${rows
          .map(
            ([what, value, src]) =>
              `<li class="item plain"><span class="rank"></span><div class="main"><div><b>${esc(what)}</b></div><div class="meta">${inline(src)}</div></div><span class="side">${esc(value)}</span></li>`
          )
          .join('')}</ul></div>`
    )
    .join('');
}

function renderScheduler(m) {
  if (!m.runs)
    return empty(
      "The runs document hasn't loaded yet. It's written by the scheduled planner after every run."
    );
  const last = m.runs.last;
  const head = last
    ? `<div class="group"><h3>Last run</h3><div class="${m.schedulerStale ? 'empty' : 'rule'}">${esc(last.when)} · ${esc(last.outcome)}${m.schedulerStale ? `. Nothing for ${Math.floor(m.lastRunAge)} hours: check that the Mac is awake, and <code>cdwr agent status</code> for a paused or unloaded job.` : ''}</div></div>`
    : '';
  const job = m.runs.job;
  const jobText = !job
    ? 'Not reported yet. The installed run.sh predates the Job line: run <code>cdwr agent install</code>.'
    : job.install === 'stale'
      ? `${esc(job.line)}. The ${job.host === 'container' ? "image's" : 'installed'} copy differs from main${job.items ? ` (${esc(job.items)})` : ''}: ${updateHint(job)}.`
      : job.install === 'unknown'
        ? `${esc(job.line)}. The scheduler couldn't read origin/main to compare.`
        : esc(job.line);
  const hostRow = job?.host
    ? `<dl class="kv"><dt>Runs on</dt><dd>${hostHTML(job)}</dd>${job.host === 'container' && !job.rev ? `<dt>Image</dt><dd>No commit on the Job line yet. The image learns its own commit with the ticket that bakes it in; until then <code>docker inspect cdwr-agent</code> shows it.</dd>` : ''}</dl>`
    : '';
  const jobHTML = `<div class="group"><h3>Job</h3>${hostRow}<div class="${!job || job.install === 'stale' ? 'empty' : 'rule'}">${jobText}</div></div>`;
  const rows = m.runs.rows
    .map(
      (r) => `<li class="item ${isProblem(r.outcome) ? 'blocked' : 'ready'}">
      <span class="rank"></span>
      <div class="main"><div><b>${esc(r.outcome)}</b>${r.ticket ? ` <span class="id">${txt(r.ticket)}</span>` : ''}</div>
      <div class="meta">${inline(r.detail)}</div></div>
      <span class="side">${esc(r.when)}</span></li>`
    )
    .join('');
  return (
    head +
    jobHTML +
    `<div class="group"><h3>Recent runs that did something</h3>${rows ? `<ul>${rows}</ul>` : empty('None yet.')}</div>
    <p class="rule">Idle runs update the last-run and job lines at most once an hour. The scheduler plans new tickets itself. For answers, reviews and parked work it starts an implementing session when none is alive (<code>launched</code>, then <code>implemented</code>, <code>cap</code> or <code>failed</code>). A problem is any outcome other than planned, idle, suggested or nothing, for example a failed run or one that planned nothing. It turns the tile red until a later run goes well. Full logs: <code>cdwr agent logs</code>.</p>`
  );
}

function renderAttended(m) {
  const s = m.session;
  const h = headline(m);
  const head = `<div class="group"><h3>Now</h3><div class="verdict">${h.text}</div>${h.note ? `<p class="rule">${h.note}</p>` : ''}</div>`;
  const facts = s
    ? `<div class="group"><h3>Heartbeat</h3><dl class="kv">
      <dt>State</dt><dd>${esc(SESSION[s.state] || s.state)}${s.detail ? ' · ' + esc(s.detail) : ''}</dd>
      <dt>Ticket</dt><dd>${s.ticket ? idLink(s.ticket) : 'none claimed'}</dd>
      <dt>Last seen</dt><dd>${s.lastSeen ? esc(new Date(s.lastSeen).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })) + ' · ' + esc(seenAgo(s.lastSeen)) : '–'}</dd>
      ${s.id ? `<dt>Session</dt><dd><code>${esc(s.id.slice(0, 8))}</code></dd>` : ''}
    </dl></div>`
    : '';
  return (
    head +
    facts +
    `<div class="group"><h3>What the states mean</h3><ul class="knobs">
      <li><b>Live</b><span>Hooks stamped the session recently. <i>working</i> runs tools, <i>polling</i> waits in <code>wait.sh</code> for the queue to change, which costs no turns.</span></li>
      <li><b>Stuck</b><span>Polling for ${STUCK_MIN} min or more while the queue has work for it: its wait missed the change. Type anything in its terminal.</span></li>
      <li><b>Waits on you</b><span>A permission prompt or an idle prompt in the terminal. Nothing moves until you answer it.</span></li>
      <li><b>Stopped</b><span>The session ended its turn or exited. With work waiting, the scheduler starts an implementing session on its next run.</span></li>
      <li><b>No session</b><span>No work-queue session registered on this Mac.</span></li>
    </ul></div>
    <p class="rule">From the queue view the scheduler publishes on every run that changes it, so it is as fresh as the last run and stops while the Mac sleeps. <code>cdwr agent status</code> shows the same.</p>`
  );
}

function renderAll(m) {
  const queuePos = new Map(m.next.map((x, n) => [x.ticket, n + 1]));
  const shown = m.all.filter((i) =>
    filter === 'all'
      ? true
      : filter === 'agent'
        ? agentState(i)
        : ['unstarted', 'started'].includes(i.statusType) &&
          i.status !== 'Triage'
  );
  const rows = shown
    .map((i) => {
      const s = agentState(i);
      const shownS = s;
      const chip = s
        ? `<span class="chip ${shownS}">${queuePos.has(i.id) ? 'agent #' + queuePos.get(i.id) : shownS}</span>`
        : '';
      return itemHTML(i, {
        state: s ? shownS : 'plain',
        rank: m.all.indexOf(i) + 1,
        side: chip
      });
    })
    .join('');
  return `<div class="filters" role="group" aria-label="Filter">
      <button type="button" data-f="all" aria-pressed="${filter === 'all'}">All open</button>
      <button type="button" data-f="todo" aria-pressed="${filter === 'todo'}">Todo + In Progress</button>
      <button type="button" data-f="agent" aria-pressed="${filter === 'agent'}">Agent only</button>
    </div>
    ${shown.length ? `<ol>${rows}</ol>` : empty('No tickets match this filter.')}
    <p class="rule">Manual drag order in a Linear view isn't exposed through the connector.</p>`;
}

// ---------- Sheet ----------

function showSheet(id, focus = true) {
  const w = SHEETS.find((x) => x.id === id);
  if (!w) return;
  openSheet = id;
  $('sheet-title').textContent = w.title;
  $('sheet-sub').textContent = w.sub;
  $('sheet-body').innerHTML = w.body(model());
  $('sheet').hidden = false;
  $('scrim').hidden = false;
  $('sheet-body').querySelectorAll('[data-chart]').forEach(drawChart);
  try {
    history.replaceState(null, '', '#' + id);
  } catch {}
  if (focus) $('sheet-close').focus();
}
function hideSheet() {
  const was = openSheet;
  openSheet = null;
  $('sheet').hidden = true;
  $('scrim').hidden = true;
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch {}
  const el = document.querySelector(`[data-w="${was}"]`);
  (el?.matches('button') ? el : el?.querySelector('.open'))?.focus();
}

document.addEventListener('click', (e) => {
  if (e.target.closest('a')) return;
  const t = e.target.closest('[data-w]');
  if (t) {
    showSheet(t.dataset.w);
    return;
  }
  const f = e.target.closest('[data-f]');
  if (f) {
    filter = f.dataset.f;
    try {
      localStorage.setItem('aq-filter', filter);
    } catch {}
    render();
  }
});
document.addEventListener('change', (e) => {
  const s = e.target.closest?.('[data-af]');
  if (!s) return;
  actFilter = s.value;
  render();
  document.querySelector('[data-af]')?.focus();
});
$('sheet-close').onclick = hideSheet;
$('scrim').onclick = hideSheet;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openSheet) hideSheet();
});

// ---------- Render and load ----------

const SUPABASE_ERRORS = ['runs', 'usage', 'activity'];
function errorCopy(e, key) {
  const source = SUPABASE_ERRORS.includes(key) ? 'Supabase' : 'Linear';
  switch (e?.code) {
    case 'unauthorized':
      return source === 'Supabase'
        ? 'Supabase rejected the anon key. Check it in Settings.'
        : 'Linear rejected the API key. Check it in Settings.';
    case 'network':
      return (
        "Can't reach " +
        source +
        '. Showing the last data; it refreshes when the connection is back.'
      );
    case 'bad_response':
      return "Got an answer that couldn't be read.";
    case 'needs_reauth':
      return 'Linear needs reconnecting. Check the key in Settings, then refresh.';
    case 'server_not_connected':
    case 'selection_required':
      return "Linear isn't connected for you. Add the key in Settings, then refresh.";
    case 'not_in_manifest':
    case 'consent_required':
      return 'Linear is turned off for this page. Check the key in Settings.';
    case 'blocked_by_policy':
    case 'approval_required':
      return "Your organization's policy blocks this page from reading Linear.";
    case 'server_unavailable':
    case 'rate_limited':
      return (
        source + " didn't answer. Showing the last data; refresh to try again."
      );
    case 'tool_error':
      return (
        source + ' refused the request: ' + (e.message || 'no reason given')
      );
    default:
      return (
        "Couldn't load from " + source + ': ' + (e?.message || 'unknown error')
      );
  }
}
const RETRACT = [
  'unauthorized',
  'bad_response',
  'needs_reauth',
  'server_not_connected',
  'selection_required',
  'not_in_manifest',
  'consent_required',
  'blocked_by_policy',
  'approval_required'
];

function renderNotice() {
  const errs = Object.values(errors);
  const n = $('notice');
  if (!mcp) {
    n.hidden = false;
    n.className = 'notice';
    n.textContent = 'Waiting for settings.';
    return;
  }
  if (!errs.length) {
    n.hidden = true;
    return;
  }
  n.hidden = false;
  n.className =
    'notice' + (errs.some((e) => RETRACT.includes(e.code)) ? ' err' : '');
  n.textContent = [
    ...new Set(Object.entries(errors).map(([k, e]) => errorCopy(e, k)))
  ].join(' ');
}

function render() {
  renderMain();
  if (openSheet) {
    const scroll = $('sheet-body').scrollTop;
    showSheet(openSheet, false);
    $('sheet-body').scrollTop = scroll;
  }
  const loaded = STATES.some((s) => buckets[s]);
  $('fresh').textContent = loaded
    ? 'Updated ' +
      new Date(storedAt || Date.now()).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    : mcp
      ? 'Loading…'
      : 'Waiting for settings';
  renderNotice();
}

const prFromAttachments = (atts) => {
  for (const a of atts || []) {
    const n = String(a.url || '').match(
      /^https:\/\/github\.com\/codeware-sthlm\/cdwr\/pull\/(\d+)/
    )?.[1];
    if (n) return Number(n);
  }
  return null;
};
async function loadDetails() {
  const ids = new Set(
    openIssues()
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
  await Promise.all(
    [...ids].map(async (id) => {
      try {
        const r = await mcp.callTool(
          SERVER,
          'get_issue',
          { id, includeRelations: true },
          { cache: { staleTime: 60000 } }
        );
        const p = r.payload || {};
        details[id] = {
          ...parsePlan(p.description),
          idea: parseIdea(p.description),
          blockedBy: (p.relations?.blockedBy || []).map((b) => b.id),
          pr: prFromAttachments(p.attachments)
        };
        delete errors['detail:' + id];
      } catch (e) {
        errors['detail:' + id] = e;
      }
    })
  );
  const handoffIds = v
    ? v.table.after.filter((x) => x.kind === 'handoffs').map((x) => x.ticket)
    : [];
  await Promise.all(
    handoffIds.map(async (id) => {
      try {
        const r = await mcp.callTool(
          SERVER,
          'list_comments',
          { issueId: id, limit: 100, orderBy: 'createdAt' },
          { cache: { staleTime: 30000 } }
        );
        liveHandoffs[id] = parseHandoffs(r.payload?.comments);
        delete errors['handoffs:' + id];
      } catch (e) {
        errors['handoffs:' + id] = e;
      }
    })
  );
  // The discard word of a cancelled idea is its last comment, as the suggest-improvement skill reads it
  const cancelled = (ideas || []).filter(
    (i) => i.statusType === 'canceled' && !(i.id in ideaReasons)
  );
  await Promise.all(
    cancelled.map(async (i) => {
      try {
        const r = await mcp.callTool(
          SERVER,
          'list_comments',
          { issueId: i.id, limit: 50, orderBy: 'createdAt' },
          { cache: { staleTime: 600000 } }
        );
        const lastComment = (r.payload?.comments || [])
          .slice()
          .sort(byCreated)
          .pop();
        ideaReasons[i.id] = lastComment
          ? String(lastComment.body || '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 80)
          : '';
        delete errors['reason:' + i.id];
      } catch (e) {
        errors['reason:' + i.id] = e;
      }
    })
  );
  render();
}

let detailTimer = null;
function scheduleDetails() {
  clearTimeout(detailTimer);
  detailTimer = setTimeout(loadDetails, 150);
}

function watchAll() {
  // The "runs", "usage" and "activity" payloads arrive in the shapes the page reads (see the declarations above)
  const opts = { refetchInterval: 120000, cache: { staleTime: 30000 } };
  for (const s of STATES) {
    mcp.watchTool(
      SERVER,
      'list_issues',
      { team: TEAM, state: s, limit: 250, fields: FIELDS },
      (ev) => {
        if (ev.type === 'data') {
          buckets[s] = ev.result.payload?.issues || [];
          storedAt = ev.result.cache?.storedAt || Date.now();
          delete errors['list:' + s];
          render();
          scheduleDetails();
        } else {
          errors['list:' + s] = ev.error;
          if (RETRACT.includes(ev.error.code)) delete buckets[s];
          render();
        }
      },
      opts
    );
  }
  mcp.watchTool(
    'Supabase',
    'runs',
    {},
    (ev) => {
      if (ev.type === 'data') {
        runs = ev.result.payload;
        delete errors['runs'];
        scheduleDetails();
      } else {
        errors['runs'] = ev.error;
        if (RETRACT.includes(ev.error.code)) runs = null;
      }
      render();
    },
    opts
  );
  mcp.watchTool(
    'Supabase',
    'usage',
    {},
    (ev) => {
      if (ev.type === 'data') {
        usage = ev.result.payload;
        delete errors['usage'];
      } else {
        errors['usage'] = ev.error;
        if (RETRACT.includes(ev.error.code)) usage = null;
      }
      render();
    },
    opts
  );
  mcp.watchTool(
    'Supabase',
    'activity',
    {},
    (ev) => {
      if (ev.type === 'data') {
        activity = ev.result.payload;
        delete errors['activity'];
      } else {
        errors['activity'] = ev.error;
        if (RETRACT.includes(ev.error.code)) activity = null;
      }
      render();
    },
    opts
  );
  mcp.watchTool(
    SERVER,
    'list_issues',
    {
      team: TEAM,
      label: IDEA_LABEL,
      updatedAt: IDEA_WINDOW,
      limit: 100,
      fields: [...FIELDS, 'completedAt', 'canceledAt']
    },
    (ev) => {
      if (ev.type === 'data') {
        ideas = ev.result.payload?.issues || [];
        delete errors['ideas'];
        render();
        scheduleDetails();
      } else {
        errors['ideas'] = ev.error;
        if (RETRACT.includes(ev.error.code)) ideas = null;
        render();
      }
    },
    opts
  );
  mcp.watchTool(
    SERVER,
    'list_issues',
    {
      team: TEAM,
      state: 'completed',
      updatedAt: CLOSED_WINDOW,
      limit: 100,
      fields: [...FIELDS, 'completedAt']
    },
    (ev) => {
      if (ev.type === 'data') {
        closed = ev.result.payload?.issues || [];
        delete errors['list:completed'];
        render();
      } else {
        errors['list:completed'] = ev.error;
        if (RETRACT.includes(ev.error.code)) closed = null;
        render();
      }
    },
    opts
  );
}

$('refresh').onclick = async () => {
  if (!mcp) return;
  $('fresh').textContent = 'Refreshing…';
  try {
    await Promise.all([mcp.invalidate(SERVER), mcp.invalidate('Supabase')]);
  } catch {}
  for (const k of Object.keys(details)) delete details[k];
  for (const k of Object.keys(liveHandoffs)) delete liveHandoffs[k];
  for (const k of Object.keys(ideaReasons)) delete ideaReasons[k];
  loadDetails();
};
try {
  const f = localStorage.getItem('aq-filter');
  if (f) filter = f;
} catch {}

document.querySelectorAll('[data-agent-avatar]').forEach((img) => {
  img.src = AGENT_AVATAR;
});
render();
const startHash = (location.hash || '').slice(1);
if (SHEETS.some((w) => w.id === startHash)) showSheet(startHash, false);

// adapter: { watchTool(server, tool, args, cb, opts), callTool(server, tool, args, opts), invalidate(server) }
export function start(adapter) {
  mcp = adapter;
  if (mcp) watchAll();
  render();
}
