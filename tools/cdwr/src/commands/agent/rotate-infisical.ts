import {
  probeWrite,
  readKeyLengths,
  setSecretFromFile
} from '@codeware/shared/util/infisical-cli';

import { defineCommand } from '../../cli/command';
import type { Context } from '../../cli/context';
import { CliError, EXIT, UsageError, messageOf } from '../../cli/errors';
import { input } from '../../cli/inputs';
import {
  type ClientSecret,
  InfisicalApiError,
  createClientSecret,
  listClientSecrets,
  login,
  readVaultValues,
  revokeClientSecret,
  userToken
} from '../../services/infisical-identity';
import { probeSession } from '../infisical/session.logic';
import { PROJECTS } from '../secrets/catalog';

import { CONTAINER, DEFAULT_WAIT_MINUTES, assertHost } from './deploy.logic';
import { containerProblem, lockHost, restartIdleLocked } from './host';
import { hostInput } from './remote';
import { VAULT_FILE, sha256Hex } from './rotate-fly.logic';
import {
  IDENTITY_TARGETS,
  INFISICAL_ROTATIONS,
  type IdentityTarget,
  claimsOf,
  describeSecret,
  descriptionOf,
  toRevoke
} from './rotate-infisical.logic';

const VAULT = {
  path: '/agent-queue',
  environment: 'production',
  projectId: PROJECTS['agent-host'].id
} as const;

type Source = 'api' | 'paste';

/** The current secret's login: the identity and the secret's own id */
async function currentClaims(clientId: string, secret: string | undefined) {
  if (!secret) return undefined;
  try {
    return claimsOf(await login(clientId, secret));
  } catch (error) {
    const refused =
      error instanceof InfisicalApiError &&
      (error.status === 401 || error.status === 403);
    if (refused) return undefined;
    throw error;
  }
}

/** Your own token and the identity's secrets, or why the API can't be used */
async function readSecrets(
  identityId: string
): Promise<
  | { kind: 'ok'; token: string; secrets: ClientSecret[] }
  | { kind: 'refused'; why: string }
> {
  try {
    const token = userToken();
    return {
      kind: 'ok',
      token,
      secrets: await listClientSecrets(token, identityId)
    };
  } catch (error) {
    return { kind: 'refused', why: messageOf(error) };
  }
}

interface Planned {
  host: string;
  wait: number;
  target: IdentityTarget;
  clientId: string;
  identityId: string;
  old: string | undefined;
  /** How the old secret reads in the UI */
  oldSecret: string | undefined;
  source: Source;
  revoke: string[];
}

/** A new secret, from the API or pasted; proven with a login on the identity before it goes anywhere */
async function newSecret(
  ctx: Context,
  plan: Planned
): Promise<{ value: string; id: string; created: boolean }> {
  const key = INFISICAL_ROTATIONS[plan.target].clientSecret;
  let value: string | undefined;
  let createdId: string | undefined;
  if (plan.source === 'api') {
    try {
      const created = await ctx.ui.task(
        `Creating a client secret "${descriptionOf(key)}"`,
        async () =>
          createClientSecret(userToken(), plan.identityId, {
            description: descriptionOf(key),
            ttl: 0
          })
      );
      value = created.value;
      createdId = created.id;
    } catch (error) {
      if (!(error instanceof InfisicalApiError) || !ctx.ui.interactive) {
        throw new CliError(
          `The client secret could not be created: ${messageOf(error)}`,
          EXIT.failed,
          'Nothing was written or revoked. Create one in the Infisical UI and run this again with --paste'
        );
      }
      ctx.ui.warn(
        `The API refused the create (${messageOf(error)}); paste one made in the Infisical UI instead`
      );
    }
  }
  value ??= (
    await ctx.ui.password({
      message: `New client secret for the ${plan.target} identity (created in the Infisical UI)`,
      validate: (v) => (v.trim() ? undefined : 'Paste the client secret')
    })
  ).trim();

  const proven = await ctx.ui
    .task(`Logging in with the new ${key}`, async () =>
      claimsOf(await login(plan.clientId, value))
    )
    .catch(() => undefined);
  if (proven?.identityId !== plan.identityId) {
    if (createdId) {
      await revokeClientSecret(userToken(), plan.identityId, createdId).catch(
        () => undefined
      );
    }
    throw new CliError(
      proven
        ? `The new secret logs in as another identity (${proven.identityId})`
        : 'The new secret does not log in',
      EXIT.failed,
      `Nothing was written${createdId ? ' and the new secret was revoked' : ''}; the old secret still works`
    );
  }
  return { value, id: proven.clientSecretId, created: !!createdId };
}

/** Everything the run does under the host deploy lock */
async function rotate(ctx: Context, plan: Planned) {
  const key = INFISICAL_ROTATIONS[plan.target].clientSecret;
  await ctx.ui.task(
    `Checking agent-host ${VAULT.path} accepts writes`,
    async () => probeWrite(VAULT)
  );

  const fresh = await newSecret(ctx, plan);

  try {
    await ctx.ui.task(
      `Writing ${key} to agent-host ${VAULT.path}`,
      async () => {
        setSecretFromFile({ ...VAULT, key, value: fresh.value });
        const stored = readKeyLengths(
          VAULT.path,
          VAULT.environment,
          undefined,
          VAULT.projectId
        ).find((entry) => entry.key === key);
        if (stored?.length !== fresh.value.length) {
          throw new Error(`${key} did not read back at its length`);
        }
      }
    );
  } catch (error) {
    // The write may have landed, and both secrets still work
    throw new CliError(
      `${key} could not be written to the vault: ${messageOf(error)}`,
      EXIT.failed,
      `The vault holds the old or the new secret (${fresh.id}), and both still work. Run this again. ${oldOf(plan)}`
    );
  }

  const resumed = await restartIdleLocked(ctx, plan.host, plan.wait);

  const problem = await containerProblem(
    plan.host,
    key,
    sha256Hex(fresh.value)
  );

  const paused = resumed
    ? []
    : ['The queue may still be paused (see the warning)'];
  if (problem) {
    throw new CliError(
      `Wrote a new ${key} on ${plan.host}; nothing was revoked`,
      EXIT.failed,
      [
        problem,
        ...paused,
        `Fix that, then run this again. ${oldOf(plan)}`
      ].join('. ')
    );
  }

  // The old secret and leftovers the plan showed; a refused list or anything unplanned fails the run
  const live = await readSecrets(plan.identityId);
  if (live.kind === 'refused') {
    return done(
      plan,
      fresh.id,
      [],
      [`could not read the identity's secrets (${live.why})`],
      [oldOf(plan), ...paused]
    );
  }
  const { revoke, others } = toRevoke(live.secrets, {
    keep: fresh.id,
    old: plan.old,
    key
  });
  const planned = revoke.filter((s) => plan.revoke.includes(s.id));
  const unplanned = revoke.filter((s) => !plan.revoke.includes(s.id));
  const revoked: string[] = [];
  const left: string[] = [];
  for (const secret of planned) {
    try {
      await ctx.ui.task(`Revoking ${describeSecret(secret)}`, () =>
        revokeClientSecret(live.token, plan.identityId, secret.id)
      );
      revoked.push(secret.id);
    } catch (error) {
      left.push(`${describeSecret(secret)}: ${messageOf(error)}`);
    }
  }
  return done(
    plan,
    fresh.id,
    revoked,
    [...left, ...unplanned.map((s) => `not in the plan: ${describeSecret(s)}`)],
    [...others.map((s) => `left alone: ${describeSecret(s)}`), ...paused]
  );
}

/** The secret the run replaces, named for the UI: a rerun logs in with the new one and no longer knows it */
const oldOf = (plan: Planned): string =>
  plan.oldSecret
    ? `The replaced secret, ${plan.oldSecret}, is not found by a rerun: delete it in the Infisical UI if this run did not revoke it`
    : 'The replaced secret was not known by id; delete it in the Infisical UI';

function done(
  plan: Planned,
  created: string,
  revoked: string[],
  left: string[],
  notes: string[]
) {
  const key = INFISICAL_ROTATIONS[plan.target].clientSecret;
  if (left.length) {
    throw new CliError(
      `Rotated ${key} on ${plan.host}; ${revoked.length} old secret(s) revoked`,
      EXIT.failed,
      [
        `Still to revoke, in the Infisical UI or by running this again: ${left.join('; ')}`,
        ...notes
      ].join('. ')
    );
  }
  return {
    summary: [
      `Rotated ${key} on ${plan.host}; ${revoked.length} old secret(s) revoked`,
      ...notes
    ].join('. '),
    json: {
      host: plan.host,
      target: plan.target,
      identityId: plan.identityId,
      created,
      revoked
    }
  };
}

/**
 * The whole run holds the host deploy lock. The new client secret is proven
 * with a login before it reaches the vault, and the old one is revoked only
 * once the restarted container holds the new value. Universal auth keeps
 * several secrets live at once, so a stop anywhere leaves a working one in
 * the vault, and a rerun revokes the earlier runs' leftovers.
 */
export default defineCommand({
  summary: 'New client secrets for the platform and desk identities',
  description: `Makes a new universal-auth client secret for the Infisical identity the agent container reads with (${IDENTITY_TARGETS.map((t) => `${t}: ${INFISICAL_ROTATIONS[t].clientSecret}`).join(', ')}), through the API with your own \`infisical login\`, or pasted into a hidden prompt (--paste, or when the API refuses). It proves the secret with a login, writes it to agent-host Infisical ${VAULT.path}, restarts the agent container with the queue idle, all under the host deploy lock held for the whole run, checks that the container holds the new value (by hash), and only then revokes the old secret and any earlier run's leftover ("cdwr: <KEY>"). No value is ever printed.`,
  danger: 'destructive',
  needs: ['infisical'],
  inputs: {
    host: hostInput('The host whose agent container uses the identity'),
    target: input.enum(IDENTITY_TARGETS, {
      prompt: 'Which identity?',
      positional: true,
      description: 'The identity, named by what uses it'
    }),
    identityId: input.string({
      prompt: 'Identity id?',
      short: 'I',
      description:
        "The identity's id, when the current secret no longer logs in",
      optional: true,
      flagOnly: true
    }),
    paste: input.boolean({
      prompt: 'Paste the new secret?',
      short: 'p',
      description:
        'Paste a secret made in the Infisical UI instead of creating one through the API',
      default: false,
      flagOnly: true
    }),
    wait: input.number({
      prompt: 'Minutes to wait for the queue to be idle?',
      short: 'w',
      description: 'Minutes to wait for a running job before giving up',
      default: DEFAULT_WAIT_MINUTES
    })
  },

  async plan(ctx, { host, target, identityId, paste, wait }) {
    if (!host) {
      throw new UsageError(
        'Missing --host',
        'Name the host that runs the agent container, such as --host agent-host'
      );
    }
    assertHost(host);
    const keys = INFISICAL_ROTATIONS[target];
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
      readVaultValues([keys.clientId, keys.clientSecret], VAULT)
    );
    const clientId = values[keys.clientId];
    if (!clientId) {
      throw new CliError(
        `${keys.clientId} is not in agent-host ${VAULT.path}`,
        EXIT.failed,
        "Write the identity's client id there first"
      );
    }
    const claims = await ctx.ui.task(
      `Logging in with the current ${keys.clientSecret}`,
      () => currentClaims(clientId, values[keys.clientSecret])
    );
    if (claims && identityId && claims.identityId !== identityId) {
      throw new UsageError(
        `--identity-id ${identityId} is not the identity the current secret logs in as (${claims.identityId})`,
        'Leave --identity-id out'
      );
    }
    const identity = claims?.identityId ?? identityId;
    if (!identity) {
      throw new CliError(
        `The current ${keys.clientSecret} does not log in, so the identity is unknown`,
        EXIT.failed,
        "Pass the identity's id from the Infisical UI with --identity-id"
      );
    }

    const listed = await ctx.ui.task("Reading the identity's secrets", () =>
      readSecrets(identity)
    );
    const source: Source = paste || listed.kind === 'refused' ? 'paste' : 'api';
    if (source === 'paste' && !ctx.ui.interactive) {
      throw new UsageError(
        listed.kind === 'refused'
          ? `The API can't be used (${listed.why}), and a pasted secret needs a prompt`
          : '--paste needs a prompt',
        'Run it in a terminal without --json'
      );
    }
    const current = listed.kind === 'ok' ? listed.secrets : [];
    const { revoke, others } = toRevoke(current, {
      keep: '',
      old: claims?.clientSecretId,
      key: keys.clientSecret
    });

    const notes = [
      ...(claims
        ? []
        : [
            `The current ${keys.clientSecret} does not log in; the old secret is not known by id`
          ]),
      ...(listed.kind === 'refused'
        ? [
            `The API can't be used (${listed.why}): you paste the new secret, and delete the old one in the Infisical UI`
          ]
        : []),
      ...others.map((s) => `left alone: ${describeSecret(s)}`)
    ];

    const data: Planned = {
      host,
      wait,
      target,
      clientId,
      identityId: identity,
      old: claims?.clientSecretId,
      oldSecret: (() => {
        const old = current.find((s) => s.id === claims?.clientSecretId);
        return old ? describeSecret(old) : claims?.clientSecretId;
      })(),
      source,
      revoke: revoke.map((s) => s.id)
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
        source === 'api'
          ? {
              label: `Create a client secret "${descriptionOf(keys.clientSecret)}" on identity ${identity}`,
              detail: 'through the API, no expiry, as the current ones'
            }
          : {
              label: `Paste a client secret made on identity ${identity} in the Infisical UI`,
              detail: 'a hidden prompt'
            },
        {
          label: `Log in with it, then write it as ${keys.clientSecret}`,
          detail: 'read back by length'
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
          label: `Revoke the old secrets`,
          detail:
            listed.kind === 'refused'
              ? 'not through the API; named for you to delete'
              : revoke.length
                ? revoke.map(describeSecret).join('; ')
                : 'none found'
        }
      ],
      notes,
      target: { environment: 'production', name: host },
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
