import { ZodError } from 'zod';

import { type ParsedArgs, splitMulti } from './args';
import type { Context } from './context';
import { CliError, UsageError } from './errors';
import {
  type Choice,
  type InputSpec,
  type Inputs,
  type Partial,
  type Resolved,
  flagOf
} from './inputs';

/**
 * An input states it is optional by carrying a default, or by being wrapped in
 * `input.optional`. Everything else is required, whether it arrives as a flag
 * or as an answer.
 */
const isOptional = (spec: InputSpec<unknown>): boolean =>
  Boolean(spec.optional) || spec.default !== undefined;

const validate = <T>(spec: InputSpec<T>, value: unknown, flag: string): T => {
  // An empty string used to travel on and fail somewhere further away — against
  // a database, or as a validation error on a field nobody set
  if (!isOptional(spec) && typeof value === 'string' && !value.trim()) {
    throw new UsageError(`--${flag}: a value is required`);
  }
  if (!spec.schema) return value as T;
  try {
    return spec.schema.parse(value);
  } catch (error) {
    const reason =
      error instanceof ZodError
        ? error.issues.map((i) => i.message).join(', ')
        : String(error);
    throw new UsageError(`--${flag}: ${reason}`);
  }
};

/** A prompt validator from the input's schema */
const validator =
  <T>(spec: InputSpec<T>) =>
  (value: string): string | undefined => {
    if (!spec.schema) {
      return isOptional(spec) || value.trim()
        ? undefined
        : 'A value is required';
    }
    const result = spec.schema.safeParse(value);
    return result.success
      ? undefined
      : result.error.issues.map((i) => i.message).join(', ');
  };

async function loadChoices<T>(
  ctx: Context,
  spec: InputSpec<T>,
  resolved: Partial,
  flag: string
): Promise<ReadonlyArray<Choice<T>>> {
  if (!spec.choices) return [];
  const choices = await ctx.ui.task(
    `Loading options for --${flag}`,
    async () => spec.choices?.(ctx, resolved) ?? [],
    (list) => `${list.length} option(s) for --${flag}`
  );
  if (choices.length === 0) {
    throw new CliError(`Nothing to choose from for --${flag}`);
  }
  return choices;
}

const inChoices = <T>(
  choices: ReadonlyArray<Choice<T>>,
  value: T,
  flag: string
): T => {
  if (choices.some((c) => c.value === value)) return value;
  const known = choices.map((c) => String(c.value)).join(', ');
  throw new UsageError(`--${flag}: '${String(value)}' is not one of ${known}`);
};

/** Turn a raw flag value into the input's value, validated */
async function fromFlag<T>(
  ctx: Context,
  spec: InputSpec<T>,
  raw: string | boolean | string[],
  resolved: Partial,
  flag: string
): Promise<T> {
  switch (spec.kind) {
    case 'boolean':
      return raw as T;
    case 'number': {
      const n = Number(raw);
      if (Number.isNaN(n)) throw new UsageError(`--${flag}: not a number`);
      return validate(spec, n, flag);
    }
    case 'multiselect': {
      const values = splitMulti(raw as string | string[]);
      // The prompt enforces `min`; a flag has to be held to it too, or
      // `--locales=` arrives as an empty list and the command guesses
      if (spec.min !== undefined && values.length < spec.min) {
        throw new UsageError(
          `--${flag}: pick at least ${spec.min}, got ${values.length}`
        );
      }
      if (spec.choices && !spec.trustFlag) {
        const choices = await loadChoices(ctx, spec, resolved, flag);
        for (const v of values) inChoices(choices, v as unknown, flag);
      }
      return validate(spec, values, flag);
    }
    case 'enum': {
      if (!spec.values?.includes(String(raw))) {
        throw new UsageError(
          `--${flag}: '${String(raw)}' is not one of ${spec.values?.join(', ')}`
        );
      }
      return validate(spec, raw, flag);
    }
    case 'select': {
      if (spec.choices && !spec.trustFlag) {
        const choices = await loadChoices(ctx, spec, resolved, flag);
        inChoices(choices, raw as unknown as T, flag);
      }
      return validate(spec, raw, flag);
    }
    default:
      return validate(spec, raw, flag);
  }
}

async function fromPrompt<T>(
  ctx: Context,
  spec: InputSpec<T>,
  resolved: Partial,
  flag: string,
  fallback: T | undefined
): Promise<T> {
  const { ui } = ctx;
  switch (spec.kind) {
    case 'boolean':
      return (await ui.confirm({
        message: spec.prompt,
        initial: (fallback as boolean | undefined) ?? (spec.initial as boolean)
      })) as T;
    case 'enum':
    case 'select': {
      const choices = await loadChoices(ctx, spec, resolved, flag);
      return ui.select({
        message: spec.prompt,
        choices: choices as ReadonlyArray<Choice<string>>,
        initial: fallback as string | undefined
      }) as Promise<T>;
    }
    case 'multiselect': {
      const choices = await loadChoices(ctx, spec, resolved, flag);
      return ui.multiselect({
        message: spec.prompt,
        choices: choices as ReadonlyArray<Choice<string>>,
        initial: fallback as string[] | undefined,
        min: spec.min
      }) as Promise<T>;
    }
    case 'secret':
      return validate(
        spec,
        await ui.password({ message: spec.prompt, validate: validator(spec) }),
        flag
      );
    case 'number': {
      const answer = await ui.text({
        message: spec.prompt,
        placeholder: spec.placeholder,
        initial: fallback === undefined ? undefined : String(fallback),
        validate: (v) => (Number.isNaN(Number(v)) ? 'Not a number' : undefined)
      });
      return validate(spec, Number(answer), flag);
    }
    default:
      return validate(
        spec,
        await ui.text({
          message: spec.prompt,
          placeholder: spec.placeholder,
          initial: fallback as string | undefined,
          validate: validator(spec)
        }),
        flag
      );
  }
}

/**
 * Give every input a value: the flag if passed, else a default or the
 * remembered value when nothing can be asked, else a prompt.
 */
export async function resolveInputs<I extends Inputs>(
  ctx: Context,
  inputs: I,
  raw: ParsedArgs['values']
): Promise<Resolved<I>> {
  const resolved: Partial = {};
  const canAsk = ctx.ui.interactive && !ctx.flags.nonInteractive;

  for (const [key, spec] of Object.entries(inputs)) {
    const flag = flagOf(key, spec);
    const given = raw[key];
    if (spec.when && !spec.when(resolved)) {
      // Asked for but not applicable: dropping it silently would run the
      // command without what was asked, and say nothing — `--fresh` with a
      // production environment would quietly become a plain apply
      if (given !== undefined) {
        throw new UsageError(
          `--${flag} does not apply with the other inputs given`,
          `${spec.description ?? spec.prompt} Remove it, or change what it depends on`
        );
      }
      resolved[key] = undefined;
      continue;
    }
    let value: unknown;

    const fallback =
      typeof spec.default === 'function'
        ? (spec.default as (r: Partial) => unknown)(resolved)
        : spec.default;

    if (given !== undefined) {
      value = await fromFlag(ctx, spec, given, resolved, flag);
    } else if (fallback !== undefined) {
      value = fallback;
    } else if (!canAsk || spec.flagOnly) {
      // What a prompt would have started on is the sensible answer when nobody can be asked
      if (spec.initial !== undefined) {
        value = spec.initial;
      } else if (spec.kind === 'boolean') {
        value = false;
      } else if (spec.optional) {
        value = undefined;
      } else {
        throw new UsageError(
          `Missing --${flag}`,
          `${spec.prompt} Pass it as a flag, or run without --non-interactive`
        );
      }
    } else {
      const initial =
        (spec.remember ? ctx.prefs.get(key) : undefined) ?? spec.initial;
      value = await fromPrompt(
        ctx,
        spec,
        resolved,
        flag,
        initial as typeof spec.initial
      );
    }

    if (spec.remember && spec.kind !== 'secret' && value !== undefined) {
      ctx.prefs.set(key, value);
    }
    resolved[key] = value;
  }

  return resolved as Resolved<I>;
}

/** Inputs as history and `--json` may show them: secrets dropped */
export const publicInputs = (
  inputs: Inputs,
  values: Record<string, unknown>
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) => inputs[key]?.kind !== 'secret' && value !== undefined
    )
  );
