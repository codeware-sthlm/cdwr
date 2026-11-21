import type { ZodType } from 'zod';

import type { GlobalShort } from './args';
import type { Context } from './context';

/** One option of a select or multiselect input */
export interface Choice<T = string> {
  value: T;
  label?: string;
  hint?: string;
}

/** Values resolved so far, passed to loaders and guards in declaration order */
export type Partial = Record<string, unknown>;

type Loader<T> = (
  ctx: Context,
  resolved: Partial
) => Promise<ReadonlyArray<Choice<T>>> | ReadonlyArray<Choice<T>>;

export type InputKind =
  | 'string'
  | 'secret'
  | 'boolean'
  | 'number'
  | 'enum'
  | 'select'
  | 'multiselect';

interface InputBase<T> {
  kind: InputKind;
  /** Flag name without dashes; defaults to the kebab-cased input key */
  flag?: string;
  /** Question asked when the value is missing */
  prompt: string;
  /** What the input is for; shown in help and in shell completion */
  description: string;
  /** Placeholder shown in a text prompt */
  placeholder?: string;
  /** Persist the last value as the next default */
  remember?: boolean;
  /** Ask only when this holds; otherwise the value is undefined */
  when?: (resolved: Partial) => boolean;
  /** Why `when` can rule the input out, finishing `--flag …` in the error for a flag given anyway */
  whenReason?: string;
  /** Used, without a prompt, when the flag is not given */
  default?: T | ((resolved: Partial) => T | undefined);
  /** Validates and coerces a flag value or a typed answer */
  schema?: ZodType<T>;
  /** Static values for enum inputs, also used by completion */
  values?: ReadonlyArray<string>;
  /** Options for select inputs, loaded when the prompt is about to show */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  choices?: Loader<any>;
  /** Choices are worth loading only to prompt, never to validate a flag */
  trustFlag?: boolean;
  /** Minimum picks for a multiselect */
  min?: number;
  /** What the prompt starts on; a remembered value takes precedence. Used as the answer when nothing can be asked */
  initial?: T;
  /** Marks inputs wrapped by `input.optional` */
  optional?: boolean;
  /** Only mentioned in help, never prompted: the value has to come from a flag */
  flagOnly?: boolean;
}

type Letter =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'
  | 'u'
  | 'v'
  | 'w'
  | 'x'
  | 'y'
  | 'z';

/** A single-letter alias no global flag uses */
export type ShortLetter = Exclude<Letter | Uppercase<Letter>, GlobalShort>;

/**
 * Where the value comes from: a positional argument, or a flag that always has
 * a short alias. Collisions inside one command are caught by `parseCommandArgs`.
 */
type Placement =
  | {
      /** Positional argument instead of a flag */ positional: true;
      short?: never;
    }
  | { positional?: false; /** Single-letter alias */ short: ShortLetter };

export type InputSpec<T = unknown> = InputBase<T> & Placement;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Inputs = Record<string, InputSpec<any>>;

/** The values a command receives once every input is resolved */
export type Resolved<I extends Inputs> = {
  [K in keyof I]: I[K] extends InputSpec<infer T> ? T : never;
};

type Opts<T> = Omit<InputBase<T>, 'kind' | 'values' | 'choices'> & Placement;

/** Descriptors for what a command needs; flags first, prompts for the rest */
export const input = {
  string: (opts: Opts<string>): InputSpec<string> => ({
    kind: 'string',
    ...opts
  }),

  /** Masked when typed; never written to history or prefs */
  secret: (opts: Opts<string>): InputSpec<string> => ({
    kind: 'secret',
    ...opts
  }),

  boolean: (opts: Opts<boolean>): InputSpec<boolean> => ({
    kind: 'boolean',
    ...opts
  }),

  number: (opts: Opts<number>): InputSpec<number> => ({
    kind: 'number',
    ...opts
  }),

  /** One of a fixed set of strings */
  enum: <const V extends ReadonlyArray<string>>(
    values: V,
    opts: Opts<V[number]> & { hints?: Record<string, string> }
  ): InputSpec<V[number]> => {
    const { hints } = opts;
    return {
      ...opts,
      kind: 'enum',
      values,
      choices: () => values.map((value) => ({ value, hint: hints?.[value] }))
    };
  },

  /** One of a set discovered at run time, such as a Fly app */
  select: <T extends string>(
    opts: Opts<T> & { choices: Loader<T> }
  ): InputSpec<T> => ({ kind: 'select', ...opts }),

  multiselect: <T extends string>(
    opts: Opts<T[]> & { choices: Loader<T> }
  ): InputSpec<T[]> => ({ kind: 'multiselect', ...opts }),

  /** Asked only while `when` holds; the value is undefined otherwise. `reason` says why, for a flag given when it does not hold */
  optional: <T>(
    spec: InputSpec<T>,
    when: (resolved: Partial) => boolean,
    reason?: string
  ): InputSpec<T | undefined> => ({
    ...spec,
    when,
    whenReason: reason,
    optional: true
  })
};

/** kebab-case flag name for an input key */
export const flagOf = (key: string, spec: InputSpec): string =>
  spec.flag ?? key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
