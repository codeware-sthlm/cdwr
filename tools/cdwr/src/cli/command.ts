import type { Context } from './context';
import type { Inputs, Resolved } from './inputs';

/** How much a command can hurt, which decides when the runtime confirms */
export type Danger = 'read' | 'mutate' | 'destructive' | 'spends-money';

/** External things a command relies on, checked before anything else runs */
export type Need =
  'fly' | 'psql' | 'pg_dump' | 'docker' | 'aws' | 'gh' | 'infisical';

/** When to confirm; the default follows from the danger level */
export type Confirm = 'never' | 'production' | 'always';

export interface PlanStep {
  label: string;
  detail?: string;
}

/** What a command intends to do; returned by `plan`, shown, then handed to `apply` */
export interface Plan<D = unknown> {
  steps: Array<string | PlanStep>;
  /** Free text shown under the steps: warnings, what happens next */
  notes?: string[];
  /** What the command acts on; production targets get a typed confirmation */
  target?: { environment?: string; name?: string };
  /** Set when there is nothing to apply; the run ends after the plan */
  nothing?: string;
  data: D;
}

export interface Result {
  summary: string;
  details?: string[];
  /** Things the user still has to do by hand */
  next?: string[];
  /** Machine-readable payload for `--json`; the summary is used otherwise */
  json?: unknown;
  /** The command did some but not all of its work */
  partial?: boolean;
}

export interface CommandDef<I extends Inputs, D> {
  summary: string;
  description?: string;
  danger: Danger;
  confirm?: Confirm;
  needs?: Need[];
  inputs: I;
  /** Reads what it needs and describes the work; must not write anything */
  plan: (ctx: Context, inputs: Resolved<I>) => Promise<Plan<D>>;
  /** Performs the plan */
  apply: (ctx: Context, data: D, inputs: Resolved<I>) => Promise<Result>;
}

export type Command<I extends Inputs = Inputs, D = unknown> = CommandDef<I, D>;

/** A command of any shape, as the registry and runtime hold them */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCommand = Command<any, any>;

export const defineCommand = <I extends Inputs, D>(
  def: CommandDef<I, D>
): Command<I, D> => def;

/** Read-only commands answer without plan output */
export const readOnly = <D>(data: D): Plan<D> => ({ steps: [], data });

/**
 * The confirmation a command gets unless it says otherwise.
 *
 * A mutating command asks wherever it runs. It prints a plan first, and a plan
 * reads as a question — acting on it unasked in development surprised someone
 * into applying a site they meant to look at.
 */
export const confirmFor = (danger: Danger, override?: Confirm): Confirm => {
  if (override) return override;
  return danger === 'read' ? 'never' : 'always';
};
