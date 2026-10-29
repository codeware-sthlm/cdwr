import { z } from 'zod';

import type {
  Attended,
  AttendedVerdict,
  Idea,
  Job,
  JobHost,
  PlanProgress,
  QueueView,
  Suggested
} from './types';

// Line and description parsers for the queue_state, runs and usage text. Nothing here touches the DOM.

type Dated = { createdAt?: string | null };

export const byCreated = (a: Dated, b: Dated): number =>
  String(a.createdAt).localeCompare(String(b.createdAt));

export function parsePlan(desc: string | null | undefined): PlanProgress {
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
  // A line of its own, as watch.jq reads it: a mention of the marker in the plan text isn't one
  const next =
    (desc || '').match(/^\s*\*\*Next:?\*\*:?\s*(.+)/im)?.[1]?.trim() || null;
  return { steps, done, next };
}

// The rest of the first line that starts with `prefix`, trimmed, or null. Lines are split on fixed
// separators rather than matched with `\s*…(.*)` patterns, which backtrack polynomially (CodeQL)
const lineAfter = (
  text: string | null | undefined,
  prefix: string
): string | null => {
  for (const raw of String(text ?? '').split('\n'))
    if (raw.startsWith(prefix)) return raw.slice(prefix.length).trim();
  return null;
};

// Linear's mention tags out of a line, and any stray angle bracket with them; the text is escaped
// again wherever it is rendered
const stripTags = (s: string): string => {
  // A character scan, not a regex: a tag is everything from `<` to the next `>`; an unclosed
  // `<` keeps the text after it, and no bracket survives
  let out = '';
  let tag: string | null = null;
  for (const ch of s) {
    if (ch === '<') {
      if (tag === null) tag = '';
    } else if (ch === '>') {
      tag = null;
    } else if (tag !== null) {
      tag += ch;
    } else {
      out += ch;
    }
  }
  return tag === null ? out : out + tag;
};

// The text between `open` and the next `close`, or '' when either is missing
const between = (line: string, open: string, close: string): string => {
  const start = line.indexOf(open);
  if (start < 0) return '';
  const end = line.indexOf(close, start + open.length);
  return end < 0 ? '' : line.slice(start + open.length, end);
};

// Suggested (COD-579): run.sh `suggested_line`, "YYYY-MM-DD · COD-123 <title>", "nothing today",
// "COD-123 still open", "stopped at the budget", "failed" or "no verdict". Linear may wrap ids in mention tags.
export function parseSuggested(
  text: string | null | undefined
): Suggested | null {
  const after = lineAfter(text, 'Suggested:');
  const dot = after === null ? -1 : after.indexOf('·');
  if (after === null || dot < 0) return null;
  const date = after.slice(0, dot).trim();
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) return null;
  const rest = stripTags(after.slice(dot + 1)).trim();
  const id = /^[A-Z]+-\d+/.exec(rest)?.[0];
  if (id && /still open$/.test(rest))
    return { date, kind: 'open', ticket: id, text: rest };
  if (id)
    return {
      date,
      kind: 'suggested',
      ticket: id,
      title: rest.slice(id.length).trim(),
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
  return { date, kind, text: rest };
}

// A suggestion's description, as the suggest-improvement skill writes it: Evidence bullets, What changes, Cost, Focus, Why now
export function parseIdea(desc: string | null | undefined): Idea | null {
  const text = String(desc || '');
  const section = (name: string): string =>
    (text.split(new RegExp('^## ' + name + '\\s*$', 'm'))[1] || '')
      .split(/^## /m)[0]
      .trim();
  const bullets = (s: string): string[] =>
    s
      .split('\n')
      .map((l) => l.match(/^\s*[-*]\s+(.*)$/)?.[1])
      .filter((b): b is string => Boolean(b));
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

// Unticked items of the newest "**Agent: PR ready**" comment's "Hand-off checklist:" block, as watch.jq `handoffs` reads them
export function parseHandoffs(
  comments: readonly (Dated & { body?: string | null })[] | null | undefined
): string[] {
  const c = (comments || [])
    .filter((x) => String(x.body || '').startsWith('**Agent: PR ready**'))
    .sort(byCreated)
    .pop();
  if (!c) return [];
  const lines = String(c.body).split('\n');
  const at = lines.findIndex(
    (l) =>
      l
        .trim()
        .replace(/^\*\*|\*\*$/g, '')
        .toLowerCase() === 'hand-off checklist:'
  );
  if (at < 0) return [];
  const items: string[] = [];
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

// The queue state and runs: a "Last run:" line, an "Attended:" line, a "Job:" line, then a table of runs that weren't idle, newest first
// Job: on launchd "every 10 min · install current", "· install out of date (run.sh, interval)" or "· install unknown";
// in the agent-host container "· image sha-9c7a20d", "· image sha-9c7a20d out of date (run.sh, …)", or "· image" with no
// commit for a local build (the CI build passes AGENT_IMAGE_SHA).
// With the listener up the interval reads "live · fallback 60 min" instead of "every 10 min".
export function parseJob(text: string | null | undefined): Job | null {
  const line = lineAfter(text, 'Job:');
  if (!line) return null;
  const live = /\blive\b/.test(line);
  const minutes =
    Number(line.match(/fallback (\d+) min/)?.[1]) ||
    Number(line.match(/every (\d+) min/)?.[1]) ||
    null;
  const host: JobHost | null = /·\s*image\b/.test(line)
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
    live,
    host,
    rev,
    install,
    items: between(line, 'out of date (', ')')
  };
}

const VERDICTS: readonly AttendedVerdict[] = ['running', 'run now', 'idle'];

// Attended (COD-545): watch.jq `attended_line`, what an attended /work-queue would take now.
// "running: COD-1 · <Next line>", "run now: COD-2 answered" (or review feedback, ready, take over COD-3 …),
// "idle: waits on …; limit 3/5". Missing when the scheduler couldn't compute one. Linear may wrap ids in mention tags.
export function parseAttended(
  text: string | null | undefined
): Attended | null {
  const after = lineAfter(text, 'Attended:');
  if (after === null) return null;
  const verdict = VERDICTS.find((v) => after.startsWith(`${v}:`));
  if (!verdict) return null;
  return {
    verdict,
    text: stripTags(after.slice(verdict.length + 1)).trim()
  };
}

// The queue view (watch.jq `queue_view`, COD-556): a fenced JSON block in the queue state, the one
// source of what the agent takes next, what the limit holds, and what waits on Håkan before and after.
// As lenient as the page always was: only `limit` and `table` must be present, the rest gets defaults.
const pr = z.union([z.number(), z.string()]).nullish();
// A field watch.jq may leave out or emit as null, read as absent
const opt = <T extends z.ZodTypeAny>(item: T) =>
  item.nullish().transform((v) => v ?? undefined);
const list = <T extends z.ZodTypeAny>(item: T) =>
  z
    .array(item)
    .nullish()
    .transform((v) => v || []);

// A malformed entry is dropped alone, not the view
const labelEntry = z.object({
  ticket: z.string(),
  parent: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  blockers: list(z.string())
});

const queueViewSchema = z
  .object({
    at: opt(z.string()),
    limit: z.object({ used: z.number(), max: z.number() }).passthrough(),
    session: z
      .object({
        state: z.string(),
        detail: z.string().nullish(),
        id: z.string().nullish(),
        ticket: z.string().nullish(),
        lastSeen: z.string().nullish()
      })
      .passthrough()
      .nullish()
      .transform((v) => v || { state: 'none' }),
    next: list(
      z.object({
        ticket: z.string(),
        reason: opt(z.string()),
        detail: z.string().nullish()
      })
    ),
    held: z
      .object({
        tickets: list(z.string()),
        free: list(
          z.object({
            action: opt(z.string()),
            ticket: opt(z.string()),
            pr,
            value: opt(z.union([z.number(), z.string()]))
          })
        )
      })
      .nullish()
      .transform((v) => v || { tickets: [], free: [] }),
    parked: list(
      z.object({
        ticket: z.string(),
        wait: opt(z.string()),
        pr,
        since: opt(z.string()),
        resolved: z.boolean().nullish(),
        outcome: z.string().nullish()
      })
    ),
    table: z.object({
      before: list(z.object({ ticket: z.string(), kind: opt(z.string()) })),
      label: z
        .array(z.unknown())
        .nullish()
        .transform((v) =>
          (v ?? []).flatMap((x) => {
            const p = labelEntry.safeParse(x);
            return p.success ? [p.data] : [];
          })
        ),
      after: list(
        z.object({
          ticket: z.string(),
          kind: opt(z.string()),
          pr,
          items: opt(z.array(z.string()))
        })
      )
    })
  })
  .passthrough();

export const validateQueueView = (v: unknown): QueueView | null => {
  const parsed = queueViewSchema.safeParse(v);
  if (!parsed.success) return null;
  const { at, limit, session, next, held, parked, table } = parsed.data;
  return { at, limit, session, next, held, parked, table };
};
