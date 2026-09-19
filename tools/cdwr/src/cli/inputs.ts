import type { ZodType } from 'zod';

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

export interface InputSpec<T = unknown> {
  kind: InputKind;
  /** Flag name without dashes; defaults to the kebab-cased input key */
  flag?: string;
  /** Single-letter alias */
  short?: string;
  /** Question asked when the value is missing */
  prompt: string;
  /** Shown in help next to the flag */
  description?: string;
  /** Placeholder shown in a text prompt */
  placeholder?: string;
  /** Persist the last value as the next default */
  remember?: boolean;
  /** Ask only when this holds; otherwise the value is undefined */
  when?: (resolved: Partial) => boolean;
  /** Used, without a prompt, when the flag is not given */
  default?: T | ((resolved: Partial) => T | undefined);
  /** Validates and coerces a flag value or a typed answer */
  schema?: ZodType<T>;
  /** Static values for enum inputs, also used by completion */
  values?: ReadonlyArray<string>;
  /** Options for select inputs, loaded when the prompt is about to show */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  choices?: Loader<any>;
  /** Positional argument instead of a flag */
  positional?: boolean;
  /** Choices are worth loading only to prompt, never to validate a flag */
  trustFlag?: boolean;
  /** Minimum picks for a multiselect */
  min?: number;
  /** What the prompt starts on; a remembered value takes precedence. A boolean falls back to it when nothing can be asked */
  initial?: T;
  /** Marks inputs wrapped by `input.optional` */
  optional?: boolean;
  /** Only mentioned in help, never prompted: the value has to come from a flag */
  flagOnly?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Inputs = Record<string, InputSpec<any>>;

/** The values a command receives once every input is resolved */
export type Resolved<I extends Inputs> = {
  [K in keyof I]: I[K] extends InputSpec<infer T> ? T : never;
};

type Opts<T> = Omit<InputSpec<T>, 'kind' | 'values' | 'choices'>;

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
    const { hints, ...rest } = opts;
    return {
      kind: 'enum',
      values,
      choices: () => values.map((value) => ({ value, hint: hints?.[value] })),
      ...rest
    };
  },

  /** One of a set discovered at run time, such as a Fly app */
  select: <T extends string>(
    opts: Opts<T> & { choices: Loader<T> }
  ): InputSpec<T> => ({ kind: 'select', ...opts }),

  multiselect: <T extends string>(
    opts: Opts<T[]> & { choices: Loader<T> }
  ): InputSpec<T[]> => ({ kind: 'multiselect', ...opts }),

  /** Asked only while `when` holds; the value is undefined otherwise */
  optional: <T>(
    spec: InputSpec<T>,
    when: (resolved: Partial) => boolean
  ): InputSpec<T | undefined> => ({ ...spec, when, optional: true })
};

/** kebab-case flag name for an input key */
export const flagOf = (key: string, spec: InputSpec): string =>
  spec.flag ?? key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
