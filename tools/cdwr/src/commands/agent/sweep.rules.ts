import { pullRequestOf } from '../../services/fly';

/**
 * The daily sweep's rules. Each checks an outcome against what should hold, so it catches drift
 * however it was caused. Adding a rule is one entry in SWEEP_RULES and its spec.
 */

/** A source the sweep reads; a reader that throws makes its rules unchecked, never a finding */
export type Read<T> = () => Promise<T>;

export interface FlyApp {
  name: string;
  status: string;
}

/** The previous run's sweep.json, as far as the rules need it */
export interface PreviousSweep {
  apps: Record<string, string>;
  /** Finding keys already reported, those of rules that went unchecked since included */
  known: string[];
}

export interface SweepContext {
  /** Every Fly app in the org with its status */
  apps: Read<FlyApp[]>;
  /** A pull request's state, `open` or `closed`; null when GitHub doesn't know it */
  pullRequest: (prNumber: number) => Promise<'open' | 'closed' | null>;
  /** The implement spend ledger's lines; null when there is no ledger */
  ledger: Read<string[] | null>;
  /** The previous sweep.json; null on the first run */
  previous: Read<PreviousSweep | null>;
}

export interface Finding {
  /** `<rule>:<subject>`, stable across runs, so a notice names only what is new */
  key: string;
  rule: string;
  subject: string;
  message: string;
  /** The command that fixes it */
  fix: string;
}

export interface Unchecked {
  rule: string;
  reason: string;
}

export interface SweepRule {
  id: string;
  /** Finds what doesn't hold; throws when its source can't be read */
  check: (ctx: SweepContext) => Promise<Omit<Finding, 'key' | 'rule'>[]>;
}

export const NO_PREVIEW_ACCESS = 'no pg-preview access';

/** A rule whose source the sweep can't reach yet: it always reports unchecked */
const unreachable =
  (reason: string): SweepRule['check'] =>
  async () => {
    throw new Error(reason);
  };

export const SWEEP_RULES: SweepRule[] = [
  {
    // A preview app left on Fly after its pull request closed or merged
    id: 'orphan-app',
    check: async (ctx) => {
      const previews = (await ctx.apps()).flatMap(({ name }) => {
        const pr = name.startsWith('cdwr-') ? pullRequestOf(name) : undefined;
        return pr === undefined ? [] : [{ name, pr }];
      });
      const states = await Promise.all(
        previews.map(({ pr }) => ctx.pullRequest(pr))
      );
      // An unknown state is never a finding, and it leaves the rule unchecked, so the keys it
      // reported before stay known instead of notifying again once GitHub answers
      const unknown = previews.filter((_, i) => states[i] === null);
      if (unknown.length) {
        throw new Error(
          `the state of PR ${[...new Set(unknown.map(({ pr }) => pr))].join(', ')} is unknown`
        );
      }
      return previews
        .filter((_, i) => states[i] === 'closed')
        .map(({ name, pr }) => ({
          subject: name,
          message: `${name} is still on Fly, and PR ${pr} is closed`,
          fix: `fly apps destroy ${name} --yes`
        }));
    }
  },
  // Rules 2 and 3 need pg-preview, which the NUC can't reach yet
  { id: 'orphan-database', check: unreachable(NO_PREVIEW_ACCESS) },
  { id: 'orphan-role', check: unreachable(NO_PREVIEW_ACCESS) },
  { id: 'preview-volume', check: unreachable(NO_PREVIEW_ACCESS) },
  {
    // An app still pending in two sweeps in a row
    id: 'pending-app',
    check: async (ctx) => {
      const [apps, previous] = await Promise.all([ctx.apps(), ctx.previous()]);
      if (!previous) return [];
      return apps
        .filter(
          ({ name, status }) =>
            status === 'pending' && previous.apps[name] === 'pending'
        )
        .map(({ name }) => ({
          subject: name,
          message: `${name} has been pending since the last sweep`,
          fix: `fly status --app ${name}`
        }));
    }
  },
  {
    // The implement spend ledger reads the way run.sh's spent_today reads it
    id: 'spend-ledger',
    check: async (ctx) => {
      const lines = await ctx.ledger();
      if (!lines) return [];
      const found: Omit<Finding, 'key' | 'rule'>[] = [];
      // The contract of spendForDay (agent.logic.ts), the stricter of the two readers beside
      // run.sh's spent_today: every line an object with a numeric cost, on any day. A line that
      // breaks it leaves the spend unreadable and stops implement launches.
      lines.forEach((line, index) => {
        if (!line.trim()) return;
        let row: unknown;
        try {
          row = JSON.parse(line);
        } catch {
          row = undefined;
        }
        if (typeof row !== 'object' || row === null || Array.isArray(row)) {
          found.push({
            subject: `line-${index + 1}`,
            message: `implement-spend.jsonl line ${index + 1} is not a JSON object`,
            fix: `fix or remove line ${index + 1} of implement-spend.jsonl`
          });
          return;
        }
        const { cost } = row as { cost?: unknown };
        if (typeof cost !== 'number' || !Number.isFinite(cost)) {
          found.push({
            subject: `line-${index + 1}`,
            message: `implement-spend.jsonl line ${index + 1} has no numeric cost`,
            fix: `fix or remove line ${index + 1} of implement-spend.jsonl`
          });
        }
      });
      // A negative day counts as 0 in spent_today, so the sum itself is no finding
      return found;
    }
  }
];

export interface SweepResult {
  findings: Finding[];
  unchecked: Unchecked[];
}

const reasonOf = (error: unknown) =>
  (error instanceof Error ? error.message : String(error))
    .split('\n')[0]
    .trim();

/** Runs every rule; a rule that throws is unchecked, and the others still run */
export async function runSweep(
  ctx: SweepContext,
  rules: SweepRule[] = SWEEP_RULES
): Promise<SweepResult> {
  const findings: Finding[] = [];
  const unchecked: Unchecked[] = [];
  for (const rule of rules) {
    try {
      for (const found of await rule.check(ctx)) {
        findings.push({
          key: `${rule.id}:${found.subject}`,
          rule: rule.id,
          ...found
        });
      }
    } catch (error) {
      unchecked.push({ rule: rule.id, reason: reasonOf(error) });
    }
  }
  return { findings, unchecked };
}
