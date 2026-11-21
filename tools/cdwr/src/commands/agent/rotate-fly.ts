import {
  probeWrite,
  readKeyLengths,
  setSecretFromFile
} from '@codeware/shared/util/infisical-cli';

import { defineCommand } from '../../cli/command';
import type { Context } from '../../cli/context';
import { CliError, EXIT, UsageError, messageOf } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { type FlyToken, listOrgTokens, ownFlyEnv } from '../../services/fly';
import { run } from '../../services/shell';
import { probeSession } from '../infisical/session.logic';
import { PROJECTS } from '../secrets/catalog';

import { CONTAINER, DEFAULT_WAIT_MINUTES, assertHost } from './deploy.logic';
import {
  POLL_MAX_MS,
  containerHash,
  lockHost,
  restartIdleLocked
} from './host';
import { hostInput } from './remote';
import {
  FLY_ROTATIONS,
  type FlyKey,
  VAULT_FILE,
  createArgs,
  namesOf,
  newTokenId,
  revokeSet,
  sha256Hex,
  toRevoke
} from './rotate-fly.logic';

const FLY_KEYS = Object.keys(FLY_ROTATIONS).filter(
  (key): key is FlyKey => key in FLY_ROTATIONS
);
const ORG = 'codeware';
const VAULT = {
  path: '/agent-queue',
  environment: 'production',
  projectId: PROJECTS['agent-host'].id
} as const;

const flyctl = (args: string[], env: NodeJS.ProcessEnv = ownFlyEnv()) =>
  run('flyctl', args, { env });

const revoke = async (ids: string[]): Promise<void> => {
  if (ids.length) await flyctl(['tokens', 'revoke', ...ids]);
};

const describe = (token: FlyToken) =>
  `${token.id} "${token.name}", expires ${token.expiresAt.slice(0, 10)}`;

interface Rotated {
  key: FlyKey;
  id: string;
  hash: string;
}

/** Creates the key's token and proves it on a Fly read; the value never leaves this function but in the vault */
async function createAndWrite(ctx: Context, key: FlyKey): Promise<Rotated> {
  const { name } = namesOf(key);
  const before = await listOrgTokens(ORG);
  let token: string;
  try {
    token = (await flyctl(createArgs(key, ORG))).stdout.trim();
  } catch {
    // The create's own output can hold the token
    throw new CliError(
      `flyctl could not create "${name}"`,
      EXIT.failed,
      'Check `flyctl auth whoami`; nothing was written or revoked'
    );
  }
  const created = newTokenId(before, await listOrgTokens(ORG), name);
  if (created.kind !== 'one') {
    throw new CliError(
      created.kind === 'none'
        ? `No new token named "${name}" shows in the token list`
        : `More than one new token named "${name}": ${created.ids.join(', ')}`,
      EXIT.failed,
      'Nothing was written or revoked; revoke the stray tokens with `flyctl tokens revoke <id>`'
    );
  }
  const { id } = created;

  try {
    await ctx.ui.task(`Proving the new ${key} on a Fly read`, () =>
      flyctl(['apps', 'list', '-o', ORG], {
        ...ownFlyEnv(),
        FLY_API_TOKEN: token
      })
    );
  } catch {
    await revoke([id]).catch(() => undefined);
    throw new CliError(
      `The new ${key} could not read Fly; it was revoked`,
      EXIT.failed,
      'The old token is untouched and still in the vault'
    );
  }

  try {
    await ctx.ui.task(
      `Writing ${key} to agent-host ${VAULT.path}`,
      async () => {
        setSecretFromFile({ ...VAULT, key, value: token });
        const stored = readKeyLengths(
          VAULT.path,
          VAULT.environment,
          undefined,
          VAULT.projectId
        ).find((entry) => entry.key === key);
        if (stored?.length !== token.length) {
          throw new Error(`${key} did not read back at its length`);
        }
      }
    );
  } catch (error) {
    // The write may have landed: revoking now could leave a dead token in the
    // vault, while old and new both still work. A rerun revokes the stray.
    throw new CliError(
      `${key} could not be written to the vault: ${messageOf(error)}`,
      EXIT.failed,
      `The vault holds the old or the new token (${id}), and both still work. Run this again: it writes a fresh token and revokes the rest`
    );
  }
  return { key, id, hash: sha256Hex(token) };
}

interface Planned {
  key: FlyKey;
  ids: string[];
  ambiguous: boolean;
}

/** Everything the run does under the host deploy lock */
async function rotate(
  ctx: Context,
  host: string,
  wait: number,
  keys: FlyKey[],
  planned: Planned[]
) {
  await ctx.ui.task(
    `Checking agent-host ${VAULT.path} accepts writes`,
    async () => probeWrite(VAULT)
  );

  const rotated: Rotated[] = [];
  try {
    for (const k of keys) rotated.push(await createAndWrite(ctx, k));
  } catch (error) {
    const own = error instanceof CliError ? error.hint : undefined;
    const written = rotated.length
      ? `Already written: ${rotated.map((r) => r.key).join(', ')}. Every token in the vault works; run this again to finish, and it revokes the strays`
      : undefined;
    throw new CliError(
      messageOf(error),
      error instanceof CliError ? error.exitCode : EXIT.failed,
      [own, written].filter(Boolean).join('. ') ||
        'Nothing was revoked; the old tokens still work'
    );
  }

  const resumed = await restartIdleLocked(ctx, host, wait);

  const checked = await Promise.all(
    rotated.map(async (r) => {
      try {
        const result = await containerHash(host, r.key);
        if (result.kind === 'not-ready') {
          return {
            ...r,
            problem: `the container never wrote ${VAULT_FILE} within ${POLL_MAX_MS / 1000} s; check \`cdwr agent logs\``
          };
        }
        return result.hash === r.hash
          ? { ...r, problem: undefined }
          : {
              ...r,
              problem: `the container does not hold the new value. A key set in the NUC's compose .env wins over the vault (the start log says "secrets: kept from the environment"); remove it there`
            };
      } catch (error) {
        return {
          ...r,
          problem: `the container's value could not be read: ${messageOf(error)}`
        };
      }
    })
  );

  const revoked: string[] = [];
  const pending: { key: FlyKey; ids: string[]; why: string }[] = [];
  const unplanned: FlyToken[] = [];
  for (const r of checked) {
    const plan = planned.find((p) => p.key === r.key);
    const old = revokeSet(await listOrgTokens(ORG), namesOf(r.key), r.id);
    const { revoke: ids, unplanned: extra } = toRevoke(
      plan?.ids ?? [],
      old.tokens,
      r.id
    );
    unplanned.push(...extra);
    if (r.problem) {
      pending.push({ key: r.key, ids, why: r.problem });
    } else if (plan?.ambiguous || old.kind === 'ambiguous') {
      pending.push({
        key: r.key,
        ids: [],
        why: `several live tokens carry the legacy name "${namesOf(r.key).legacyName}", so none was revoked; revoke the right ones by hand`
      });
    } else {
      try {
        await ctx.ui.task(`Revoking ${r.key}'s old tokens`, () => revoke(ids));
        revoked.push(...ids);
      } catch (error) {
        pending.push({
          key: r.key,
          ids,
          why: `the revoke failed: ${messageOf(error)}`
        });
      }
    }
  }

  if (pending.length || unplanned.length) {
    const todo = pending.filter((p) => p.ids.length);
    throw new CliError(
      [
        `Rotated ${rotated.map((r) => r.key).join(', ')} on ${host}; ${revoked.length} old token(s) revoked${revoked.length ? ` (${revoked.join(', ')})` : ''}`,
        todo.length
          ? `Still to revoke: ${todo.map((p) => `${p.key} ${p.ids.join(', ')}`).join('; ')}`
          : 'Nothing is left to revoke'
      ].join('. '),
      EXIT.failed,
      [
        ...pending.map((p) => `${p.key}: ${p.why}`),
        ...unplanned.map(
          (t) => `not in the plan, left alone: ${t.id} "${t.name}"`
        ),
        ...(resumed ? [] : ['The queue may still be paused (see the warning)']),
        'Fix that, then run this again; its plan shows what is left to revoke'
      ].join('. ')
    );
  }
  return {
    summary: `Rotated ${rotated.map((r) => r.key).join(', ')} on ${host}; ${revoked.length} old token(s) revoked`,
    json: {
      host,
      rotated: rotated.map(({ key: k, id }) => ({ key: k, id })),
      revoked
    }
  };
}

/**
 * The whole run holds the host deploy lock. Each new token is created and
 * proven on a Fly read before it reaches the vault, and the old ones the plan
 * showed are revoked only once the restarted container holds the new value. A
 * stop anywhere leaves a working token in the vault, and a rerun revokes what
 * its own plan shows.
 */
export default defineCommand({
  summary: 'New Fly tokens for the agent host, the old ones revoked',
  description: `Creates a new Fly token for each agent-host key (${FLY_KEYS.join(', ')}) named \`agent-host <use> (<KEY>)\`, valid one year, proves it on a Fly read, writes it to agent-host Infisical ${VAULT.path} through your own \`infisical login\`, restarts the agent container with the queue idle, all under the host deploy lock held for the whole run, checks that the container holds the new value (by hash), and only then revokes the key's other tokens. Runs on your own Fly and Infisical logins; no value is ever printed.`,
  danger: 'destructive',
  needs: ['fly'],
  inputs: {
    host: hostInput('The host whose agent container uses the tokens'),
    key: input.enum(FLY_KEYS, {
      prompt: 'Which token?',
      description: 'Only this key; both when left out',
      short: 'k',
      optional: true,
      flagOnly: true
    }),
    wait: input.number({
      prompt: 'Minutes to wait for the queue to be idle?',
      short: 'w',
      description: 'Minutes to wait for a running job before giving up',
      default: DEFAULT_WAIT_MINUTES
    })
  },

  async plan(ctx, { host, key, wait }) {
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

    const keys = key ? [key] : FLY_KEYS;
    const [tokens, stored] = await ctx.ui.task(
      'Reading the Fly tokens and the vault',
      async () =>
        [
          await listOrgTokens(ORG),
          readKeyLengths(
            VAULT.path,
            VAULT.environment,
            undefined,
            VAULT.projectId
          )
        ] as const
    );
    const targets = keys.map((k) => ({
      key: k,
      inVault: stored.some((entry) => entry.key === k),
      revoke: revokeSet(tokens, namesOf(k), '')
    }));

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
        ...targets.map(({ key: k }) => ({
          label: `Create "${namesOf(k).name}" (${FLY_ROTATIONS[k].scope}, one year), prove it, write it as ${k}`
        })),
        {
          label: `Restart ${CONTAINER} on ${host}`,
          detail: `with the queue paused and idle (up to ${wait} minutes)`
        },
        {
          label: `Check the container's ${VAULT_FILE} holds the new values`,
          detail: 'sha256 compared, never the value'
        },
        ...targets.map(({ key: k, revoke: old }) => ({
          label: `Revoke ${k}'s other tokens`,
          detail:
            old.kind === 'ambiguous'
              ? `will NOT revoke: ${old.tokens.length} live tokens named "${namesOf(k).legacyName}": ${old.tokens.map(describe).join('; ')}`
              : old.tokens.length
                ? old.tokens.map(describe).join('; ')
                : 'none found by name'
        }))
      ],
      notes: targets
        .filter((t) => !t.inVault)
        .map((t) => `${t.key} is not in the vault yet; it will be added`),
      target: { environment: 'production', name: host },
      data: {
        host,
        wait,
        keys,
        planned: targets.map(({ key: k, revoke: old }) => ({
          key: k,
          ids: old.kind === 'ok' ? old.tokens.map((t) => t.id) : [],
          ambiguous: old.kind === 'ambiguous'
        }))
      }
    };
  },

  async apply(ctx, { host, wait, keys, planned }) {
    const release = await lockHost(ctx, host, wait);
    try {
      return await rotate(ctx, host, wait, keys, planned);
    } finally {
      await release();
    }
  }
});
