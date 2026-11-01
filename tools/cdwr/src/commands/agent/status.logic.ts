import { z } from 'zod';

import {
  IMPLEMENT_OUTCOMES,
  NOTIFY_LEVELS,
  REMOTE_CONTAINER,
  WATCH_STATES,
  queueViewSchema,
  remoteCdwr
} from './agent.logic';
import { type ListenerState, listenerStateShape } from './listen.logic';
import { mirrorHost } from './mirror.logic';
import { excerpt, parseRemoteAnswer } from './remote.logic';

/** The cdwr arguments of the status report of the queue in the container */
export const STATUS_ARGS = ['agent', 'status', '--json'];

/** ssh's arguments for the status report of the queue in the container on `host` */
export const remoteStatus = (host: string): string[] =>
  remoteCdwr(host, STATUS_ARGS);

/** Exactly what the status table reads; `localReport` must produce it, so a missing or renamed field fails to compile (an extra local field does not) */
const reportShape = z.object({
  job: z.discriminatedUnion('loaded', [
    z.object({
      loaded: z.literal(true),
      running: z.boolean(),
      runs: z.number().optional(),
      lastExitCode: z.number().optional(),
      script: z.string().optional(),
      intervalSeconds: z.number().optional()
    }),
    z.object({ loaded: z.literal(false) })
  ]),
  /** Optional so a status from an older container still parses; absent means here */
  scheduler: z.enum(['here', 'elsewhere']).optional(),
  paused: z.boolean(),
  notifyLevel: z.enum(NOTIFY_LEVELS),
  host: z.enum(['launchd', 'container']),
  keySource: z.enum(['env', 'keychain-possible', 'none']),
  keyPresent: z.boolean(),
  mirror: z.string().nullable(),
  script: z.enum(['missing', 'current', 'stale', 'no-source']),
  installedAny: z.boolean(),
  watching: z.array(
    z.object({
      ticket: z.string(),
      pr: z.number(),
      state: z.enum(WATCH_STATES)
    })
  ),
  worktree: z.object({ path: z.string(), exists: z.boolean() }),
  lastScheduled: z.object({ at: z.string(), message: z.string() }).nullable(),
  lockState: z.enum(['free', 'held', 'stale']),
  lock: z.string(),
  implement: z.object({
    spent: z.number().optional(),
    cap: z.number(),
    // Absent from a container on an older image
    budget: z.number().optional(),
    last: z
      .object({
        when: z.string(),
        outcome: z.enum(IMPLEMENT_OUTCOMES),
        ticket: z.string()
      })
      .optional()
  }),
  next: z
    .object({
      kind: z.enum(['idle', 'ready', 'busy', 'skip', 'unknown']),
      tickets: z.array(z.string()),
      text: z.string()
    })
    .nullable(),
  attended: z
    .object({
      kind: z.enum(['running', 'run', 'idle', 'unknown']),
      ticket: z.string().optional(),
      text: z.string()
    })
    .nullable(),
  linear: z
    .object({
      kind: z.enum(['ok', 'missing', 'unknown']),
      text: z.string()
    })
    .nullable()
    .optional(),
  suggest: z
    .object({
      kind: z.enum(['due', 'done', 'early', 'skipped', 'off', 'unknown']),
      focus: z.string().optional(),
      ticket: z.string().optional(),
      text: z.string()
    })
    .nullable(),
  queueView: queueViewSchema.or(z.literal('malformed')).nullable(),
  // Absent from a container on an older image, and null without a listener file
  listener: listenerStateShape.nullable().optional()
});

/** The rows an attended-only machine shows; the others describe a scheduler it does not run */
const ATTENDED_ROWS: ReadonlySet<string> = new Set([
  'scheduler',
  'notify',
  'Linear key',
  'Heartbeat mirror',
  'attended',
  'linear tools',
  'queue view',
  'next',
  'held',
  'parked',
  'on your table'
]);

/** Whether the status row `check` shows for a machine with this scheduler */
export const showsRow = (
  scheduler: RemoteReport['scheduler'],
  check: string
): boolean => scheduler !== 'elsewhere' || ATTENDED_ROWS.has(check);

/** The `scheduler` row of an attended-only machine; `mirror` is the mirror target, if one is set */
export const schedulerRow = (
  mirror: string | null
): { ok: boolean | 'warn'; detail: string } => {
  const host = mirrorHost(mirror);
  return host
    ? { ok: true, detail: `runs on ${host}; cdwr agent status --host ${host}` }
    : {
        ok: 'warn',
        detail: 'not on this machine; cdwr agent status --host <host>'
      };
};

/** The summary of an attended-only machine whose rows hold no failure */
export const attendedSummary = (mirror: string | null): string =>
  `Attended only; the scheduler runs ${mirrorHost(mirror) ? `on ${mirrorHost(mirror)}` : 'elsewhere'}`;

/**
 * The summary line: an attended-only machine says so only when its rows hold no warning
 * or failure, otherwise the normal counts show
 */
export const statusSummary = (
  scheduler: RemoteReport['scheduler'],
  mirror: string | null,
  problems: number,
  warnings: number
): string =>
  problems > 0
    ? `${problems} thing(s) need attention`
    : scheduler === 'elsewhere' && warnings === 0
      ? attendedSummary(mirror)
      : warnings > 0
        ? `Loaded, with ${warnings} thing(s) worth a look`
        : 'The queue is healthy';

/** The checkout the script's `--check` runs against; this one when an attended-only machine has no planner checkout */
export const checkRepoOf = (
  scheduler: RemoteReport['scheduler'],
  worktree: { path: string; exists: boolean },
  root: string
): string =>
  scheduler === 'elsewhere' && !worktree.exists ? root : worktree.path;

export type RemoteReport = z.infer<typeof reportShape>;

/** What `cdwr agent status --json` printed, as far as it can be read */
export type RemoteAnswer =
  | { kind: 'report'; report: RemoteReport }
  | { kind: 'failed'; message: string; hint?: string }
  | { kind: 'skew'; paths: string[]; line: string }
  | { kind: 'none' };

/** The answer in `cdwr agent status --json` output; any envelope without a report reads as none */
export const parseRemoteStatus = (stdout: string): RemoteAnswer => {
  const answer = parseRemoteAnswer(stdout, reportShape);
  switch (answer.kind) {
    case 'result':
      return { kind: 'report', report: answer.result };
    case 'nothing':
    case 'plan':
      return { kind: 'none' };
    default:
      return answer;
  }
};

/** The message for an answer that holds no report */
export const unreadableStatus = (host: string, stdout: string): string =>
  `The status answer from ${host} could not be read: ${excerpt(stdout) || '(empty)'}`;

/** The message for a report whose shape differs from this cdwr's */
export const skewedStatus = (
  host: string,
  paths: string[],
  line: string
): string =>
  `The status report from ${host} differs from this cdwr's (${paths.slice(0, 3).join(', ')}${paths.length > 3 ? ', ...' : ''}); likely the Mac and the NUC run different versions, so \`cdwr agent attend\` and \`cdwr agent deploy --host ${host}\`. Answer starts: ${excerpt(line)}`;

/** The command that clears a stale lock: plain locally, through ssh when the report came from `host` */
export const rmLockCommand = (
  lock: string,
  host: string | undefined
): string =>
  host
    ? `ssh ${host} docker exec ${REMOTE_CONTAINER} rmdir ${lock}`
    : `rmdir ${lock}`;

/** What to do about scripts that differ from the repo's, per kind of host */
export const staleScriptsHint = (host: 'launchd' | 'container'): string =>
  host === 'container'
    ? 're-deploy with `cdwr agent deploy --host <nuc>` from the Mac'
    : 're-run `cdwr agent install`';

export type { ListenerState } from './listen.logic';

/** The listener file's text as a state; null when absent or unreadable */
export const parseListener = (
  text: string | undefined
): ListenerState | null => {
  if (text === undefined) return null;
  try {
    const parsed = listenerStateShape.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

/** The listener counts as live while its heartbeat is younger than this */
export const LISTENER_STALE_MS = 2 * 60_000;

/** The `job` row of the container loop, from the listener file at `now` */
export const formatContainerJob = (
  listener: ListenerState | null | undefined,
  now: Date,
  intervalMinutes: number,
  fallbackMinutes: number
): { ok: boolean | 'warn'; detail: string } => {
  if (!listener)
    return {
      ok: true,
      detail: `polling every ${intervalMinutes} min (no listener)`
    };
  const beat = Date.parse(listener.lastBeat);
  if (listener.state === 'live' && now.getTime() - beat < LISTENER_STALE_MS)
    return {
      ok: true,
      detail: `live (events), fallback every ${fallbackMinutes} min`
    };
  const since = new Date(
    listener.state === 'down' ? listener.since : listener.lastBeat
  );
  const at = Number.isNaN(since.getTime())
    ? 'unknown'
    : since.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  return {
    ok: 'warn',
    detail: `polling every ${intervalMinutes} min (listener down since ${at})`
  };
};
