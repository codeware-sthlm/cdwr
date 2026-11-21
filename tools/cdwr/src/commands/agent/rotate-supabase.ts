import {
  probeWrite,
  readSharedValue,
  setSecretFromFile
} from '@codeware/shared/util/infisical-cli';
import { z } from 'zod';

import { defineCommand } from '../../cli/command';
import type { Context } from '../../cli/context';
import { CliError, EXIT, UsageError, messageOf } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { readVaultValues } from '../../services/infisical-identity';
import { sleep } from '../../services/shell';
import {
  type ApiKey,
  accessToken,
  createSecretKey,
  deleteApiKey,
  keyHash,
  listApiKeys,
  projectRef
} from '../../services/supabase-management';
import { keyHeaders } from '../../services/supabase-rest';
import { probeSession } from '../infisical/session.logic';
import { PROJECTS } from '../secrets/catalog';

import {
  CONTAINER,
  DEFAULT_WAIT_MINUTES,
  assertHost,
  containerHostname
} from './deploy.logic';
import { containerProblem, lockHost, restartIdleLocked, ssh } from './host';
import { hostInput } from './remote';
import { VAULT_FILE, sha256Hex } from './rotate-fly.logic';
import {
  SUPABASE_KEY,
  SUPABASE_URL_KEY,
  describeKey,
  descriptionOf,
  keyNameOf,
  toDelete
} from './rotate-supabase.logic';

const VAULT = {
  path: '/agent-queue',
  environment: 'production',
  projectId: PROJECTS['agent-host'].id
} as const;

const TIMEOUT_MS = 15_000;
/** The sampler writes a row at container start and every 60 s */
const METRICS_TRIES = 18;
const METRICS_PAUSE_MS = 10_000;

const metricsSchema = z.array(z.object({ host: z.string(), at: z.string() }));
type Metric = z.infer<typeof metricsSchema>[number];

/** host_metrics rows read with the key; throws without the key in the message */
async function readMetrics(
  url: string,
  key: string,
  query: string
): Promise<Metric[]> {
  const response = await fetch(
    `${url.replace(/\/$/, '')}/rest/v1/host_metrics?select=host,at&order=at.desc&limit=1${query}`,
    { headers: keyHeaders(key), signal: AbortSignal.timeout(TIMEOUT_MS) }
  );
  if (!response.ok) {
    throw new Error(`the host_metrics read answered ${response.status}`);
  }
  const parsed = metricsSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('the host_metrics read answered in an unknown shape');
  }
  return parsed.data;
}

/**
 * A row the restarted container wrote: the host's, newer on the server's clock
 * than its newest row once the restart is done. The old container is gone by
 * then, so only the new one can write a newer row.
 */
async function freshMetric(
  url: string,
  key: string,
  host: string
): Promise<Metric | undefined> {
  const mine = `&host=eq.${encodeURIComponent(host)}`;
  const [before] = await readMetrics(url, key, mine);
  const query = before
    ? `${mine}&at=gt.${encodeURIComponent(before.at)}`
    : mine;
  for (let attempt = 1; attempt <= METRICS_TRIES; attempt++) {
    await sleep(METRICS_PAUSE_MS);
    const [row] = await readMetrics(url, key, query).catch(() => []);
    if (row) return row;
  }
  return undefined;
}

interface Planned {
  host: string;
  wait: number;
  url: string;
  ref: string;
  name: string;
  /** The host the container's host_metrics rows carry */
  metricsHost: string;
  /** Hash of the key the vault holds now, which a rerun can no longer see */
  oldHash: string | undefined;
  /** How the old key reads in the dashboard, when the run deletes it */
  oldKey: string | undefined;
  /** Why the run deletes no old key, when it doesn't */
  oldNote: string | undefined;
  /** Hashes of keys another consumer holds, never deleted */
  spare: string[];
  remove: string[];
}

const oldOf = (plan: Planned): string =>
  plan.oldKey
    ? `The replaced key, ${plan.oldKey}, is not found by a rerun: delete it in the Supabase dashboard if this run did not`
    : (plan.oldNote ??
      'The replaced key was not known; check the API keys in the Supabase dashboard');

/** A new secret key, proven with a read before it goes anywhere */
async function newKey(ctx: Context, plan: Planned, token: string) {
  const created = await ctx.ui
    .task(`Creating the secret key "${plan.name}"`, () =>
      createSecretKey(token, plan.ref, {
        name: plan.name,
        description: descriptionOf(plan.host)
      })
    )
    .catch((error: unknown) => {
      throw new CliError(
        `The secret key could not be created: ${messageOf(error)}`,
        EXIT.failed,
        'Nothing was written or deleted'
      );
    });
  try {
    await ctx.ui.task('Reading host_metrics with it', () =>
      readMetrics(plan.url, created.value, '')
    );
    return created;
  } catch (error) {
    const removed = await deleteApiKey(token, plan.ref, created.id).then(
      () => true,
      () => false
    );
    throw new CliError(
      `The new key does not read: ${messageOf(error)}`,
      EXIT.failed,
      removed
        ? 'Nothing was written and the new key was deleted; the old key still works'
        : `Nothing was written, but the new key "${plan.name}" could not be deleted: delete it in the Supabase dashboard. The old key still works`
    );
  }
}

/** Everything the run does under the host deploy lock */
async function rotate(ctx: Context, plan: Planned) {
  await ctx.ui.task(
    `Checking agent-host ${VAULT.path} accepts writes`,
    async () => probeWrite(VAULT)
  );
  const token = await accessToken(ctx.env);
  const fresh = await newKey(ctx, plan, token);
  const kept = `Both keys still work; the new one is "${plan.name}"`;

  try {
    await ctx.ui.task(
      `Writing ${SUPABASE_KEY} to agent-host ${VAULT.path}`,
      async () => {
        setSecretFromFile({ ...VAULT, key: SUPABASE_KEY, value: fresh.value });
        const stored = readSharedValue({ ...VAULT, key: SUPABASE_KEY });
        if (
          stored === undefined ||
          sha256Hex(stored) !== sha256Hex(fresh.value)
        ) {
          throw new Error(`${SUPABASE_KEY} did not read back as the new key`);
        }
      }
    );
  } catch (error) {
    throw new CliError(
      `${SUPABASE_KEY} could not be written to the vault: ${messageOf(error)}`,
      EXIT.failed,
      `The vault holds the old or the new key. ${kept}. Run this again. ${oldOf(plan)}`
    );
  }

  let resumed: boolean;
  try {
    resumed = await restartIdleLocked(ctx, plan.host, plan.wait);
  } catch (error) {
    throw new CliError(
      `Wrote a new ${SUPABASE_KEY} on ${plan.host}, but ${messageOf(error)}; nothing was deleted`,
      EXIT.failed,
      `The vault holds the new key, and the container still runs on the old one. ${kept}. Restart the container (ssh ${plan.host} docker restart ${CONTAINER}), then delete the old key by hand: ${oldOf(plan)}`
    );
  }
  const paused = resumed
    ? []
    : ['The queue may still be paused (see the warning)'];

  const problem = await containerProblem(
    plan.host,
    SUPABASE_KEY,
    sha256Hex(fresh.value)
  );
  if (problem) {
    throw new CliError(
      `Wrote a new ${SUPABASE_KEY} on ${plan.host}; nothing was deleted`,
      EXIT.failed,
      [
        problem,
        ...paused,
        `Fix that, then run this again. ${oldOf(plan)}`
      ].join('. ')
    );
  }

  const written = await ctx.ui
    .task('Waiting for a host_metrics row from the restarted container', () =>
      freshMetric(plan.url, fresh.value, plan.metricsHost)
    )
    .catch(() => undefined);
  if (!written) {
    throw new CliError(
      `The container holds the new ${SUPABASE_KEY}, but wrote no host_metrics row within ${(METRICS_TRIES * METRICS_PAUSE_MS) / 1000} s; nothing was deleted`,
      EXIT.failed,
      [
        'Check `cdwr agent logs` for a telemetry warning',
        ...paused,
        `${kept}. ${oldOf(plan)}`
      ].join('. ')
    );
  }

  // The old key and leftovers the plan showed; a refused list or anything unplanned fails the run
  let live: ApiKey[];
  try {
    live = await listApiKeys(token, plan.ref);
  } catch (error) {
    return done(
      plan,
      fresh.id,
      [],
      [`could not read the project's keys (${messageOf(error)})`],
      [oldOf(plan), ...paused]
    );
  }
  const { remove, others } = toDelete(live, {
    keep: fresh.id,
    oldHash: plan.oldHash,
    host: plan.host,
    spare: plan.spare
  });
  // toDelete only returns keys with an id
  const planned = remove.filter((k) => plan.remove.includes(k.id ?? ''));
  const unplanned = remove.filter((k) => !plan.remove.includes(k.id ?? ''));
  const deleted: string[] = [];
  const left: string[] = [];
  for (const key of planned) {
    try {
      await ctx.ui.task(`Deleting ${describeKey(key)}`, () =>
        deleteApiKey(token, plan.ref, key.id ?? '')
      );
      deleted.push(key.name);
    } catch (error) {
      left.push(`${describeKey(key)}: ${messageOf(error)}`);
    }
  }
  return done(
    plan,
    fresh.id,
    deleted,
    [...left, ...unplanned.map((k) => `not in the plan: ${describeKey(k)}`)],
    [...others.map((k) => `left alone: ${describeKey(k)}`), ...paused]
  );
}

function done(
  plan: Planned,
  created: string,
  deleted: string[],
  left: string[],
  notes: string[]
) {
  const head = `Rotated ${SUPABASE_KEY} on ${plan.host} to "${plan.name}"; ${deleted.length} old key(s) deleted`;
  if (left.length) {
    throw new CliError(
      head,
      EXIT.failed,
      [
        `Still to delete, in the Supabase dashboard or by running this again: ${left.join('; ')}`,
        ...notes
      ].join('. ')
    );
  }
  return {
    summary: [head, ...notes].join('. '),
    json: { host: plan.host, ref: plan.ref, name: plan.name, created, deleted }
  };
}

/**
 * Secret keys coexist, so the old key keeps working until the end. The whole
 * run holds the host deploy lock. The new key is proven with a read before it
 * reaches the vault, and the old one is deleted only once the restarted
 * container holds the new value and has written telemetry with it. A key
 * named `default` or held in this checkout's tools/cdwr/.env is never deleted.
 */
export default defineCommand({
  summary: "A new Supabase secret key for the agent host's telemetry",
  description: `Creates a secret key in the agent-queue Supabase project through the Management API, with your own \`supabase login\` (SUPABASE_ACCESS_TOKEN, else the Keychain), proves it with a read, writes it as ${SUPABASE_KEY} to agent-host Infisical ${VAULT.path}, restarts the agent container with the queue idle, all under the host deploy lock held for the whole run, checks that the container holds the new value (by hash) and has written a new host_metrics row, and only then deletes the key the vault held before and any earlier run's leftover ("${descriptionOf('<host>')}"). Keys are matched by the hash the API lists, never revealed. A key named \`default\`, or the one this checkout's ${SUPABASE_KEY} holds, is never deleted, and the legacy JWT keys are left alone. No value is ever printed.`,
  danger: 'destructive',
  needs: ['infisical'],
  inputs: {
    host: hostInput('The host whose agent container uses the key'),
    wait: input.number({
      prompt: 'Minutes to wait for the queue to be idle?',
      short: 'w',
      description: 'Minutes to wait for a running job before giving up',
      default: DEFAULT_WAIT_MINUTES
    })
  },

  async plan(ctx, { host, wait }) {
    if (!host) {
      throw new UsageError(
        'Missing --host',
        'Name the host that runs the agent container, such as --host agent-host'
      );
    }
    assertHost(host);
    const session = await ctx.ui.task(
      'Checking the Infisical session (agent-host)',
      async () => probeSession(VAULT.environment, undefined, VAULT.projectId)
    );
    if (session.state !== 'ok') {
      throw new CliError(
        session.state === 'failed'
          ? session.message
          : 'Infisical CLI is not installed',
        EXIT.failed,
        session.hint
      );
    }

    const values = await ctx.ui.task('Reading the vault', async () =>
      readVaultValues([SUPABASE_KEY, SUPABASE_URL_KEY], VAULT)
    );
    const url = values[SUPABASE_URL_KEY];
    if (!url) {
      throw new CliError(
        `${SUPABASE_URL_KEY} is not in agent-host ${VAULT.path}`,
        EXIT.failed,
        'Write the project url there first'
      );
    }
    let ref: string;
    try {
      ref = projectRef(url);
    } catch (error) {
      throw new CliError(messageOf(error), EXIT.failed);
    }

    let keys: ApiKey[];
    try {
      const token = await accessToken(ctx.env);
      keys = await ctx.ui.task("Reading the project's API keys", () =>
        listApiKeys(token, ref)
      );
    } catch (error) {
      throw new CliError(
        messageOf(error),
        EXIT.failed,
        'The Management API is needed to create and delete keys'
      );
    }

    const current = values[SUPABASE_KEY];
    const oldHash = current ? keyHash(current) : undefined;
    const local = ctx.env[SUPABASE_KEY];
    const spare = local ? [keyHash(local)] : [];
    const old = oldHash ? keys.find((k) => k.hash === oldHash) : undefined;
    const { remove, others } = toDelete(keys, {
      keep: '',
      oldHash,
      host,
      spare
    });

    const replaced = old && remove.some((k) => k.id === old.id);
    const oldNote = !current
      ? `${SUPABASE_KEY} is not in the vault yet; nothing old to delete`
      : current.startsWith('eyJ') || (old && old.type !== 'secret')
        ? 'The vault holds a legacy JWT key, which this command does not delete'
        : !old
          ? `The vault's ${SUPABASE_KEY} matches no key of the project`
          : replaced
            ? undefined
            : `The vault's key, ${describeKey(old)}, is shared (a default key, or this checkout's), and stays`;
    const notes = [
      ...(oldNote ? [oldNote] : []),
      ...others.map((k) => `left alone: ${describeKey(k)}`)
    ];

    // The run checks telemetry against the container's own rows, and fails
    // before anything changes when the container reads the key from elsewhere
    const metricsHost = await ctx.ui.task(
      `Reading the hostname of ${CONTAINER}`,
      async () => (await ssh(containerHostname(host))).stdout.trim()
    );
    if (!metricsHost) {
      throw new CliError(
        `${CONTAINER} on ${host} printed no hostname`,
        EXIT.failed,
        'Check that the container runs'
      );
    }
    if (current) {
      const elsewhere = await ctx.ui.task(
        `Checking ${CONTAINER} reads ${SUPABASE_KEY} from the vault`,
        () => containerProblem(host, SUPABASE_KEY, sha256Hex(current), 'key')
      );
      if (elsewhere) {
        throw new CliError(
          `Before anything changed: ${elsewhere}`,
          EXIT.failed,
          `The rotation would never reach the container. When an earlier run stopped before its restart, restart first: ssh ${host} docker restart ${CONTAINER}`
        );
      }
    }

    const data: Planned = {
      host,
      wait,
      url,
      ref,
      name: keyNameOf(host, new Date()),
      metricsHost,
      oldHash,
      oldKey: replaced ? describeKey(old) : undefined,
      oldNote,
      spare,
      remove: remove.flatMap((k) => (k.id ? [k.id] : []))
    };
    return {
      steps: [
        {
          label: 'Take the host deploy lock for the whole run',
          detail: `waits up to ${wait} minutes`
        },
        {
          label: `Probe a write to agent-host ${VAULT.path}`,
          detail: 'a throwaway key, removed again'
        },
        {
          label: `Create the secret key "${data.name}" in project ${ref}`,
          detail: `role service_role, described "${descriptionOf(host)}"`
        },
        {
          label: `Read host_metrics with it, then write it as ${SUPABASE_KEY}`,
          detail: 'read back by hash'
        },
        {
          label: `Restart ${CONTAINER} on ${host}`,
          detail: `with the queue paused and idle (up to ${wait} minutes)`
        },
        {
          label: `Check the container's ${VAULT_FILE} holds the new value`,
          detail: 'sha256 compared, never the value'
        },
        {
          label: 'Wait for a new host_metrics row from the container',
          detail: `up to ${(METRICS_TRIES * METRICS_PAUSE_MS) / 1000} s`
        },
        {
          label: 'Delete the old keys',
          detail: remove.length
            ? remove.map(describeKey).join('; ')
            : 'none found'
        }
      ],
      notes,
      target: { environment: 'production', name: host },
      json: { host, ref, name: data.name, remove: remove.map((k) => k.name) },
      data
    };
  },

  async apply(ctx, plan) {
    const release = await lockHost(ctx, plan.host, plan.wait);
    try {
      return await rotate(ctx, plan);
    } finally {
      await release();
    }
  }
});
