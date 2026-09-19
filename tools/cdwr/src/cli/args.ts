import { parseArgs } from 'node:util';

import { UsageError } from './errors';
import { type InputSpec, type Inputs, flagOf } from './inputs';

export const GLOBAL_FLAGS = {
  yes: { type: 'boolean', short: 'y', description: 'Skip confirmations' },
  'dry-run': { type: 'boolean', description: 'Show the plan and stop' },
  json: {
    type: 'boolean',
    description: 'Machine output; implies --non-interactive'
  },
  'non-interactive': {
    type: 'boolean',
    description: 'Never prompt; a missing input is an error'
  },
  verbose: { type: 'boolean', short: 'v', description: 'Show more' },
  help: { type: 'boolean', short: 'h', description: 'Show help' }
} as const;

export type GlobalFlag = keyof typeof GLOBAL_FLAGS;

export interface ParsedArgs {
  globals: Record<GlobalFlag, boolean>;
  /** Raw flag values keyed by input key, before validation */
  values: Record<string, string | boolean | string[] | undefined>;
}

/** Parse argv against a command's inputs and the global flags */
export function parseCommandArgs(
  argv: string[],
  inputs: Inputs = {}
): ParsedArgs {
  const options: Record<
    string,
    { type: 'string' | 'boolean'; short?: string; multiple?: boolean }
  > = {};
  const byFlag = new Map<string, string>();
  const positionalKeys: string[] = [];

  for (const [name, spec] of Object.entries(GLOBAL_FLAGS)) {
    options[name] = {
      type: spec.type,
      ...('short' in spec ? { short: spec.short } : {})
    };
  }
  for (const [key, spec] of Object.entries(inputs)) {
    const flag = flagOf(key, spec);
    if (flag in options) {
      throw new Error(`Input '${key}' collides with the global --${flag} flag`);
    }
    byFlag.set(flag, key);
    if (spec.positional) positionalKeys.push(key);
    options[flag] = {
      type: spec.kind === 'boolean' ? 'boolean' : 'string',
      multiple: spec.kind === 'multiselect',
      ...(spec.short ? { short: spec.short } : {})
    };
  }

  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      options,
      allowPositionals: true,
      allowNegative: true,
      strict: true
    });
  } catch (error) {
    throw new UsageError(
      (error as Error).message.replace(/\.$/, ''),
      'Run with --help to see the flags'
    );
  }

  const globals = Object.fromEntries(
    Object.keys(GLOBAL_FLAGS).map((name) => [
      name,
      parsed.values[name] === true
    ])
  ) as Record<GlobalFlag, boolean>;

  const values: ParsedArgs['values'] = {};
  for (const [flag, key] of byFlag) {
    const value = parsed.values[flag];
    if (value !== undefined) values[key] = value as string | boolean | string[];
  }

  const extra = [...parsed.positionals];
  for (const key of positionalKeys) {
    if (values[key] === undefined && extra.length > 0)
      values[key] = extra.shift();
  }
  if (extra.length > 0) {
    throw new UsageError(
      `Unexpected argument '${extra[0]}'`,
      'Run with --help to see what this command takes'
    );
  }

  return { globals, values };
}

/** Split a comma-joined or repeated multiselect flag into values */
export const splitMulti = (value: string | string[]): string[] =>
  (Array.isArray(value) ? value : [value])
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);

/** Help text for one input's flag */
export const flagUsage = (key: string, spec: InputSpec): string => {
  const flag = flagOf(key, spec);
  const short = spec.short ? `-${spec.short}, ` : '';
  if (spec.kind === 'boolean') return `${short}--${flag}`;
  const value =
    spec.kind === 'enum' && spec.values
      ? `<${spec.values.join('|')}>`
      : spec.kind === 'multiselect'
        ? '<a,b,...>'
        : '<value>';
  return `${short}--${flag} ${value}`;
};
