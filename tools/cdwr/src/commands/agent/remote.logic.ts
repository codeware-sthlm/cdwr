import { z } from 'zod';

import type { PlanStep } from '../../cli/command';

/** The first `n` characters of `text`, for an error that quotes the answer */
export const excerpt = (text: string, n = 200): string => {
  const flat = text.trim().replace(/\s+/g, ' ');
  return flat.length > n ? `${flat.slice(0, n)}...` : flat;
};

/** What a remote `cdwr … --json` printed, as far as it can be read */
export type RemoteAnswer<T> =
  | { kind: 'result'; ok: boolean; result: T }
  | { kind: 'nothing'; nothing: string }
  | { kind: 'plan'; steps: PlanStep[]; notes?: string[] }
  | { kind: 'failed'; message: string; hint?: string }
  | { kind: 'skew'; paths: string[]; line: string }
  | { kind: 'none' };

const failure = z.object({
  ok: z.literal(false),
  error: z.object({ message: z.string(), hint: z.string().optional() })
});
const nothing = z.object({ ok: z.literal(true), nothing: z.string() });
const dryRun = z.object({
  ok: z.literal(true),
  dryRun: z.literal(true),
  plan: z.object({
    steps: z.array(
      z.object({ label: z.string(), detail: z.string().optional() })
    ),
    notes: z.array(z.string()).optional()
  })
});

/**
 * The answer in a remote `cdwr … --json` output, one of the runner's envelopes, with
 * `result` read by `resultShape`. `secrets.sh` prints a line before the command's own
 * output, so the last line holding a JSON object wins; one that fits no envelope is skew.
 */
export const parseRemoteAnswer = <S extends z.ZodTypeAny>(
  stdout: string,
  resultShape: S
): RemoteAnswer<z.output<S>> => {
  const envelope = z.object({
    ok: z.boolean().optional(),
    result: resultShape
  });
  const lines = stdout.split('\n').map((line) => line.trim());
  for (const line of lines.reverse()) {
    if (!line.startsWith('{')) continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      continue; // Not JSON; keep looking upwards
    }
    const failed = failure.safeParse(json);
    if (failed.success) return { kind: 'failed', ...failed.data.error };
    const none = nothing.safeParse(json);
    if (none.success) return { kind: 'nothing', nothing: none.data.nothing };
    const planned = dryRun.safeParse(json);
    if (planned.success) return { kind: 'plan', ...planned.data.plan };
    // A shape such as `z.unknown()` would take a missing result as undefined
    if (typeof json !== 'object' || json === null || !('result' in json))
      return { kind: 'skew', paths: ['result'], line };
    const parsed = envelope.safeParse(json);
    if (parsed.success)
      return {
        kind: 'result',
        ok: parsed.data.ok ?? true,
        result: parsed.data.result as z.output<S>
      };
    return {
      kind: 'skew',
      paths: [
        ...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(root)'))
      ],
      line
    };
  }
  return { kind: 'none' };
};

/** The remote plan's steps as local ones, each detail saying where it runs */
export const remoteSteps = (host: string, steps: PlanStep[]): PlanStep[] =>
  steps.map(({ label, detail }) => ({
    label,
    detail: detail ? `${detail} on ${host}` : `on ${host}`
  }));

/** The summary of a remote result: its own `summary` when it has one, else `fallback` */
export const remoteSummary = (result: unknown, fallback: string): string =>
  typeof result === 'object' &&
  result !== null &&
  'summary' in result &&
  typeof result.summary === 'string'
    ? result.summary
    : fallback;

/** A string array field of a remote result, such as `next` or `details` */
export const remoteLines = (
  result: unknown,
  field: 'next' | 'details'
): string[] | undefined => {
  const parsed = z.object({ [field]: z.array(z.string()) }).safeParse(result);
  return parsed.success ? (parsed.data[field] as string[]) : undefined;
};

/** The message for a remote answer this cdwr cannot read */
export const unreadableAnswer = (
  host: string,
  command: string,
  stdout: string
): string =>
  `The answer of \`${command}\` on ${host} could not be read; likely the Mac and the NUC run different versions, so \`cdwr agent attend\` and \`cdwr agent deploy --host ${host}\`. Answer starts: ${excerpt(stdout) || '(empty)'}`;
