import { basename, dirname, join } from 'node:path';

export type Role = 'planning' | 'implementing' | 'orchestrating';

export interface Tokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

/** One assistant reply, reduced to what the numbers need */
export interface Reply {
  id?: string;
  timestamp: string;
  role: Role;
  ticket: string;
  model: string;
  speed?: string;
  tokens: Tokens;
}

export interface UsageRow {
  role: Role;
  model: string;
  tokens: Tokens;
  cost: number | null;
}

export interface DayRow extends UsageRow {
  day: string;
}

export interface TicketRow extends UsageRow {
  ticket: string;
}

export interface Totals {
  cost: number;
  tokens: Tokens;
  byModel: Array<{ model: string; tokens: Tokens; cost: number | null }>;
  unpricedModels: string[];
}

export interface Aggregate {
  days: DayRow[];
  tickets: TicketRow[];
  totals: Totals;
}

/** How Claude Code names a project directory after its cwd */
export const encodeProjectPath = (p: string): string =>
  p.replace(/[^a-zA-Z0-9]/g, '-');

/** The checkout every worktree of the repo is named after: `…/codeware-cod-533` → `…/codeware` */
export const familyBase = (root: string): string =>
  join(dirname(root), basename(root).replace(/-.*$/, ''));

/** Whether a project directory belongs to the repo or one of its worktrees */
export const countsDir = (dirName: string, base: string): boolean => {
  const encoded = encodeProjectPath(base);
  return dirName === encoded || dirName.startsWith(`${encoded}-`);
};

/** The planner runs in `<base>-agent`, subagents elsewhere implement, the rest orchestrates */
export const roleOf = ({
  dirName,
  base,
  subagent
}: {
  dirName: string;
  base: string;
  subagent: boolean;
}): Role => {
  if (dirName === `${encodeProjectPath(base)}-agent`) return 'planning';
  return subagent ? 'implementing' : 'orchestrating';
};

export const ticketOf = (gitBranch: string | undefined): string => {
  const match = /^cod-(\d+)/i.exec(gitBranch ?? '');
  return match ? `COD-${match[1]}` : 'unattributed';
};

/** `claude-haiku-4-5-20251001` → `claude-haiku-4-5` */
export const normaliseModel = (id: string): string => id.replace(/-\d{8}$/, '');

/**
 * One reply per message id, requestId as the fallback. A reply is written
 * several times while it streams and early records carry partial output, so
 * the one with the most output wins.
 */
export const dedupeReplies = <
  T extends { id?: string; requestId?: string; output: number }
>(
  records: T[]
): T[] => {
  const kept = new Map<string, T>();
  const loose: T[] = [];
  for (const record of records) {
    const key = record.id ?? record.requestId;
    if (key === undefined) {
      loose.push(record);
      continue;
    }
    const seen = kept.get(key);
    if (!seen || record.output > seen.output) kept.set(key, record);
  }
  return [...kept.values(), ...loose];
};

/** When PRICES was taken from the claude-api skill's pricing reference */
export const PRICES_DATE = '2026-09-25';

// Prices per million tokens. cacheWrite5m = 1.25× input, cacheWrite1h = 2× input.
export const PRICES: Record<
  string,
  { input: number; output: number; cacheRead: number }
> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-7': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 }
};

/** Fast mode doubles every rate */
export const FAST_FACTOR = 2;

export const totalTokens = (t: Tokens): number =>
  t.input + t.output + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h;

const noTokens = (): Tokens => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite5m: 0,
  cacheWrite1h: 0
});

const addTokens = (into: Tokens, t: Tokens): void => {
  into.input += t.input;
  into.output += t.output;
  into.cacheRead += t.cacheRead;
  into.cacheWrite5m += t.cacheWrite5m;
  into.cacheWrite1h += t.cacheWrite1h;
};

/** API-equivalent dollars at full precision, or undefined for a model without a price */
export const costOf = (
  model: string,
  tokens: Tokens,
  speed?: string
): number | undefined => {
  const price = PRICES[model];
  if (!price) return undefined;
  const factor = speed === 'fast' ? FAST_FACTOR : 1;
  const perToken =
    (tokens.input * price.input +
      tokens.output * price.output +
      tokens.cacheRead * price.cacheRead +
      tokens.cacheWrite5m * price.input * 1.25 +
      tokens.cacheWrite1h * price.input * 2) /
    1_000_000;
  return perToken * factor;
};

const cents = (n: number): number => Math.round(n * 100) / 100;

interface Sum {
  tokens: Tokens;
  cost: number;
  priced: boolean;
}

const add = (sums: Map<string, Sum>, key: string, reply: Reply): void => {
  const cost = costOf(reply.model, reply.tokens, reply.speed);
  const sum = sums.get(key) ?? { tokens: noTokens(), cost: 0, priced: true };
  addTokens(sum.tokens, reply.tokens);
  if (cost === undefined) sum.priced = false;
  else sum.cost += cost;
  sums.set(key, sum);
};

// Rows keep full precision: the document sums them per day, role and ticket before rounding
const finish = (sum: Sum): { tokens: Tokens; cost: number | null } => ({
  tokens: sum.tokens,
  cost: sum.priced ? sum.cost : null
});

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** `YYYY-MM-DD` in local time, the day the Desk's other charts use */
export const localDay = (timestamp: string): string => {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** `2026-10-07 00:13` in local time, like the runs document */
export const localMinute = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Sums replies since a moment by day, by ticket and overall; cents only at output */
export const aggregate = (
  replies: Reply[],
  {
    since,
    dayOf = (timestamp) => timestamp.slice(0, 10)
  }: { since: Date; dayOf?: (timestamp: string) => string }
): Aggregate => {
  const kept = replies.filter((r) => new Date(r.timestamp) >= since);
  const days = new Map<string, Sum>();
  const tickets = new Map<string, Sum>();
  const models = new Map<string, Sum>();
  for (const reply of kept) {
    const day = dayOf(reply.timestamp);
    add(days, [day, reply.role, reply.model].join('\t'), reply);
    add(tickets, [reply.ticket, reply.role, reply.model].join('\t'), reply);
    add(models, reply.model, reply);
  }

  const rows = (sums: Map<string, Sum>) =>
    [...sums.entries()]
      .sort(([a], [b]) => byText(a, b))
      .map(([key, sum]) => ({ parts: key.split('\t'), ...finish(sum) }));

  const byModel = rows(models).map(({ parts, tokens, cost }) => ({
    model: parts[0],
    tokens,
    cost
  }));
  let cost = 0;
  const tokens = noTokens();
  for (const [model, sum] of models) {
    addTokens(tokens, sum.tokens);
    if (PRICES[model]) cost += sum.cost;
  }

  return {
    days: rows(days).map(({ parts, tokens, cost }) => ({
      day: parts[0],
      role: parts[1] as Role,
      model: parts[2],
      tokens,
      cost
    })),
    tickets: rows(tickets).map(({ parts, tokens, cost }) => ({
      ticket: parts[0],
      role: parts[1] as Role,
      model: parts[2],
      tokens,
      cost
    })),
    totals: {
      cost: cents(cost),
      tokens,
      byModel,
      unpricedModels: byModel.filter((m) => m.cost === null).map((m) => m.model)
    }
  };
};

export const ROLES: Role[] = ['planning', 'orchestrating', 'implementing'];

/** Dollars with two decimals and no sign, so the Desk parses a plain number; `?` when unpriced */
const money = (cost: number | null): string =>
  cost === null ? '?' : cost.toFixed(2);

/** Cost per role and in total over some rows; any unpriced row makes that cell unknown */
const byRole = (rows: UsageRow[]): string[] => {
  const sum = (list: UsageRow[]) =>
    list.some((r) => r.cost === null)
      ? null
      : list.reduce((acc, r) => acc + (r.cost ?? 0), 0);
  return [
    ...ROLES.map((role) => money(sum(rows.filter((r) => r.role === role)))),
    money(sum(rows))
  ];
};

const table = (head: string[], rows: string[][]): string =>
  [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '--').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`)
  ].join('\n');

const groups = <T, K extends string>(rows: T[], key: (row: T) => K) =>
  [...new Set(rows.map(key))].map((k) => ({
    key: k,
    rows: rows.filter((row) => key(row) === k)
  }));

/**
 * The "Agent queue: usage" Linear document. The Agent Desk parses it, so the
 * line prefixes, headings and columns are a contract: change both together.
 */
export const renderUsageDocument = (
  result: Aggregate,
  { updated, windowDays }: { updated: string; windowDays: number }
): string => {
  const { totals } = result;
  const models = table(
    ['Model', 'Input', 'Output', 'Cache read', 'Cache write', 'Cost'],
    totals.byModel.map(({ model, tokens, cost }) => [
      model,
      String(tokens.input),
      String(tokens.output),
      String(tokens.cacheRead),
      String(tokens.cacheWrite5m + tokens.cacheWrite1h),
      money(cost)
    ])
  );
  const daily = table(
    ['Day', 'Planning', 'Orchestrating', 'Implementing', 'Total'],
    groups(result.days, (r) => r.day).map(({ key, rows }) => [
      key,
      ...byRole(rows)
    ])
  );
  const ticketRows = groups(result.tickets, (r) => r.ticket).map(
    ({ key, rows }) => {
      const tokens = noTokens();
      for (const row of rows) addTokens(tokens, row.tokens);
      const total = rows.reduce((acc, r) => acc + (r.cost ?? 0), 0);
      return {
        key,
        total,
        cells: [
          key,
          ...byRole(rows),
          String(tokens.output),
          String(tokens.cacheRead)
        ]
      };
    }
  );
  // Most expensive first; unattributed last whatever it cost
  ticketRows.sort(
    (a, b) =>
      Number(a.key === 'unattributed') - Number(b.key === 'unattributed') ||
      b.total - a.total
  );
  const tickets = table(
    [
      'Ticket',
      'Planning',
      'Orchestrating',
      'Implementing',
      'Total',
      'Output',
      'Cache read'
    ],
    ticketRows.map((r) => r.cells)
  );

  return [
    `Updated: ${updated} · last ${windowDays} days · ${money(totals.cost)} USD`,
    `Prices: ${PRICES_DATE}${totals.unpricedModels.length > 0 ? ` · not priced: ${totals.unpricedModels.join(', ')}` : ''}`,
    'Written by the agent queue scheduler at most once an hour from the local Claude Code transcripts of this repo and its worktrees. Costs are API-equivalent USD; nothing is billed on Max. Only numbers, model names and ticket ids leave the machine, never transcript content.',
    `## Models\n\n${models}`,
    `## Daily\n\n${daily}`,
    `## Tickets\n\n${tickets}`
  ].join('\n\n');
};
