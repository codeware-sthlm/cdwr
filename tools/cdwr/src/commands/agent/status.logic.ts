import { z } from 'zod';

import {
  IMPLEMENT_OUTCOMES,
  NOTIFY_LEVELS,
  REMOTE_CONTAINER,
  WATCH_STATES,
  queueViewSchema
} from './agent.logic';

/** The checkout the queue plans in, inside the agent container */
export const REMOTE_CHECKOUT = '/work/codeware-agent';
/** Fetches the vault secrets, exports them and runs the command it is given */
export const REMOTE_SECRETS = '/opt/agent-host/secrets.sh';

/** ssh's arguments for the status report of the queue in the container on `host` */
export const remoteStatus = (host: string): string[] => [
  host,
  'docker',
  'exec',
  '-w',
  REMOTE_CHECKOUT,
  REMOTE_CONTAINER,
  REMOTE_SECRETS,
  'node',
  'tools/cdwr/bin/cdwr.mjs',
  'agent',
  'status',
  '--json'
];

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
  suggest: z
    .object({
      kind: z.enum(['due', 'done', 'early', 'skipped', 'off', 'unknown']),
      focus: z.string().optional(),
      ticket: z.string().optional(),
      text: z.string()
    })
    .nullable(),
  queueView: queueViewSchema.or(z.literal('malformed')).nullable()
});

const envelope = z.object({ result: reportShape });

export type RemoteReport = z.infer<typeof reportShape>;

/** The first `n` characters of `text`, for an error that quotes the answer */
const excerpt = (text: string, n = 200): string => {
  const flat = text.trim().replace(/\s+/g, ' ');
  return flat.length > n ? `${flat.slice(0, n)}...` : flat;
};

/** What `cdwr agent status --json` printed, as far as it can be read */
export type RemoteAnswer =
  | { kind: 'report'; report: RemoteReport }
  | { kind: 'failed'; message: string; hint?: string }
  | { kind: 'skew'; paths: string[]; line: string }
  | { kind: 'none' };

const failure = z.object({
  ok: z.literal(false),
  error: z.object({ message: z.string(), hint: z.string().optional() })
});

/**
 * The answer in `cdwr agent status --json` output. `secrets.sh` prints a line
 * before the command's own output, so the last line holding a JSON object wins.
 */
export const parseRemoteStatus = (stdout: string): RemoteAnswer => {
  const lines = stdout.split('\n').map((line) => line.trim());
  for (const line of lines.reverse()) {
    if (!line.startsWith('{')) continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      continue; // Not JSON; keep looking upwards
    }
    const parsed = envelope.safeParse(json);
    if (parsed.success) return { kind: 'report', report: parsed.data.result };
    const failed = failure.safeParse(json);
    if (failed.success) return { kind: 'failed', ...failed.data.error };
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
