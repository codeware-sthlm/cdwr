import {
  probeWrite,
  readSharedValue,
  setSecretFromFile
} from '@codeware/shared/util/infisical-cli';

import { defineCommand } from '../../cli/command';
import type { Context } from '../../cli/context';
import { CliError, EXIT, UsageError, messageOf } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { childEnv, run, sleep } from '../../services/shell';
import { accessToken, runQuery } from '../../services/supabase-management';
import { probeSession } from '../infisical/session.logic';
import { PROJECTS } from '../secrets/catalog';

import {
  BACKUP_LOCK,
  CONTAINER,
  DEFAULT_WAIT_MINUTES,
  PLATFORM_LOCK,
  assertHost,
  dropLockDir,
  lockMarked,
  lockOld,
  markLockDir,
  pathExists,
  takeLockDir
} from './deploy.logic';
import {
  containerProblem,
  lockHost,
  restartContainer,
  ssh,
  succeeds,
  whileIdle
} from './host';
import { hostInput } from './remote';
import {
  type AdminRights,
  CMS_ADMIN,
  CMS_ADMIN_SECRET,
  CMS_TARGETS,
  DB_ROLE_TARGETS,
  type DbRoleKey,
  type DbRoleTarget,
  SUPABASE_ADMIN,
  SUPABASE_ADMIN_ROLE,
  type ServerMatch,
  TARGET_NAMES,
  adminRightsOfRows,
  adminRightsSql,
  alterRoleSql,
  generatePassword,
  hostOf,
  parseAdminRights,
  projectRefOf,
  roleOf,
  sameServer,
  scramVerifier,
  withPassword
} from './rotate-db-role.logic';
import { VAULT_FILE, sha256Hex } from './rotate-fly.logic';
import { psqlEnv } from './supabase-migrate.logic';

const VAULT = {
  path: '/agent-queue',
  environment: 'production',
  projectId: PROJECTS['agent-host'].id
} as const;

const PSQL_TIMEOUT_MS = 30_000;
/** A pooler can take a while to take the new password */
const LOGIN_TRIES = 12;
const LOGIN_PAUSE_MS = 5_000;

/** Removes the secrets from text bound for the terminal */
const scrub = (text: string, secrets: string[]): string =>
  secrets.reduce(
    (out, secret) => (secret ? out.split(secret).join('••••') : out),
    text
  );

/**
 * One statement on psql's stdin, connected through libpq's env, so neither
 * the url nor the statement reaches argv. A failure carries psql's message
 * with the given secrets removed.
 */
async function psql(
  url: string,
  sql: string,
  secrets: string[] = []
): Promise<string> {
  try {
    const { stdout } = await run(
      'psql',
      ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'],
      {
        // Only the url connects: no inherited PG* (port, service, password)
        // may point psql elsewhere than the plan checked. sslmode=require
        // unless the url names one
        env: childEnv(
          Object.fromEntries(
            Object.entries(process.env).filter(([k]) => !k.startsWith('PG'))
          ),
          { ...psqlEnv(url), PGCONNECT_TIMEOUT: '10' }
        ),
        input: sql,
        timeout: PSQL_TIMEOUT_MS
      }
    );
    return stdout;
  } catch (error) {
    throw new Error(scrub(messageOf(error), [url, ...secrets]));
  }
}

/** Logs in with the url and checks who it is; retried while a pooler picks up the new password */
async function loginAs(url: string, role: string, secrets: string[]) {
  for (let attempt = 1; ; attempt++) {
    try {
      const who = (await psql(url, 'select current_user;\n', secrets)).trim();
      if (who !== role) {
        throw new Error(`logged in as "${who}", not "${role}"`);
      }
      return;
    } catch (error) {
      if (attempt >= LOGIN_TRIES) throw error;
      await sleep(LOGIN_PAUSE_MS);
    }
  }
}

/** Where the admin statements run: psql on an admin url, or the Management API on a project */
type AdminSpec = { kind: 'psql'; url: string } | { kind: 'api'; ref: string };

/** The admin connection, read and alter only */
interface Admin {
  /** The role the statements run as */
  name: string;
  rights(role: string): Promise<AdminRights>;
  alter(role: string, verifier: string, secrets: string[]): Promise<void>;
}

/**
 * The API path runs as `postgres` with your own `supabase login`. Its error
 * carries the API's message only; it is scrubbed too, in case Postgres quotes
 * the statement.
 */
async function adminOf(ctx: Context, spec: AdminSpec): Promise<Admin> {
  if (spec.kind === 'psql') {
    const name = roleOf(spec.url, 'the admin url');
    return {
      name,
      rights: async (role) =>
        parseAdminRights(await psql(spec.url, adminRightsSql(role))),
      alter: async (role, verifier, secrets) => {
        await psql(spec.url, alterRoleSql(role, verifier), [
          verifier,
          ...secrets
        ]);
      }
    };
  }
  const token = await accessToken(ctx.env);
  const query = async (sql: string, secrets: string[] = []) => {
    try {
      return await runQuery(token, spec.ref, sql);
    } catch (error) {
      // Postgres may quote only part of the statement ("at or near …"),
      // which no whole-secret scrub catches
      throw new Error(
        scrub(messageOf(error), [token, ...secrets]).replace(
          /SCRAM-SHA-256\$[^\s'"]*/g,
          '••••'
        )
      );
    }
  };
  return {
    name: SUPABASE_ADMIN_ROLE,
    rights: async (role) =>
      adminRightsOfRows(await query(adminRightsSql(role))),
    alter: async (role, verifier, secrets) => {
      await query(alterRoleSql(role, verifier), [verifier, ...secrets]);
    }
  };
}

interface Data {
  host: string;
  wait: number;
  target: DbRoleTarget;
  key: DbRoleKey;
  role: string;
  url: string;
  /** Resolved once in the plan, so the apply reads no token after the queue is paused */
  admin: Admin;
}

const RERUN =
  "so the agent container's url fails until a run completes. Run this again: it sets a fresh password";

/**
 * The run.sh lock that keeps a step off the target's url between the alter and
 * the restart: the platform step and the nightly backup run even while the
 * queue is paused. `stale` is run.sh's own takeover age.
 */
const QUEUE_LOCKS: Partial<
  Record<DbRoleTarget, { path: string; stale: number; what: string }>
> = {
  platform: { path: PLATFORM_LOCK, stale: 5, what: 'The platform step' },
  backup: { path: BACKUP_LOCK, stale: 20, what: 'The nightly backup' }
};

type Taken = 'taken' | 'busy';

/** Takes the lock, or takes back one an earlier run of this command left, or one run.sh would take over too */
async function takeQueueLock(
  host: string,
  lock: { path: string; stale: number }
): Promise<Taken> {
  const take = async (): Promise<Taken> => {
    if (!(await succeeds(takeLockDir(host, lock.path)))) return 'busy';
    await ssh(markLockDir(host, lock.path));
    return 'taken';
  };
  if ((await take()) === 'taken') return 'taken';
  const ours = await succeeds(lockMarked(host, lock.path));
  const old =
    !ours &&
    (await ssh(lockOld(host, lock.path, lock.stale))).stdout.trim() !== '';
  if (!ours && !old) return 'busy';
  await ssh(dropLockDir(host, lock.path));
  return take();
}

/** Whether a step holds the lock now, so the run can stop before it pauses anything */
async function lockBusy(
  host: string,
  lock: { path: string; stale: number }
): Promise<boolean> {
  if (!(await succeeds(pathExists(host, lock.path)))) return false;
  if (await succeeds(lockMarked(host, lock.path))) return false;
  return (await ssh(lockOld(host, lock.path, lock.stale))).stdout.trim() === '';
}

const LOCK_POLL_MS = 10_000;
const LOCK_POLL_TRIES = 30;

/** Everything from the alter to the restart, with the queue idle; a failure says what still works */
async function alterWriteRestart(ctx: Context, data: Data) {
  const { host, target, key, role, url, admin } = data;
  const lock = QUEUE_LOCKS[target];
  if (lock) {
    // Its runs are short: wait one out rather than give up
    let taken: Taken = 'busy';
    for (let i = 0; taken === 'busy' && i < LOCK_POLL_TRIES; i++) {
      if (i > 0) await sleep(LOCK_POLL_MS);
      taken = await takeQueueLock(host, lock);
    }
    if (taken === 'busy') {
      throw new CliError(
        `${lock.what} kept ${lock.path} for ${(LOCK_POLL_TRIES * LOCK_POLL_MS) / 60_000} minutes; nothing was changed`,
        EXIT.failed,
        'Try again later'
      );
    }
  }
  const password = generatePassword();
  const newUrl = withPassword(url, password);
  const secrets = [password, newUrl, url];
  const held = lock
    ? ` ${lock.path} stays held so no ${lock.what.toLowerCase()} runs on the dead url; run.sh clears it after ${lock.stale} minutes, and a rerun takes it back`
    : '';
  const fail = (error: unknown, hint: string) =>
    new CliError(scrub(messageOf(error), secrets), EXIT.failed, hint + held);

  try {
    await ctx.ui.task(`Setting a new password on "${role}"`, () =>
      admin.alter(role, scramVerifier(password), secrets)
    );
  } catch (error) {
    // A timeout or a dropped connection can follow a committed alter
    throw fail(error, `The old password may already be dead, ${RERUN}.`);
  }

  // The vault comes first: once the role is altered only the new url works
  try {
    await ctx.ui.task(
      `Writing ${key} to agent-host ${VAULT.path}`,
      async () => {
        setSecretFromFile({ ...VAULT, key, value: newUrl });
        const stored = readSharedValue({ ...VAULT, key });
        if (stored === undefined || sha256Hex(stored) !== sha256Hex(newUrl)) {
          throw new Error(`${key} did not read back as the new url`);
        }
      }
    );
  } catch (error) {
    throw fail(error, `The old password no longer works, ${RERUN}.`);
  }

  try {
    await restartContainer(ctx, host);
  } catch (error) {
    throw fail(
      error,
      `The vault holds the new url; restart the container to finish: ssh ${host} docker restart ${CONTAINER}.`
    );
  }

  try {
    await ctx.ui.task(`Logging in as "${role}" with the new url`, () =>
      loginAs(newUrl, role, secrets)
    );
  } catch (error) {
    throw fail(
      error,
      `The vault and the container hold the new url, but the role did not take it within ${(LOGIN_TRIES * LOGIN_PAUSE_MS) / 1000} s. A pooler may still be catching up: check \`cdwr agent status\` in a few minutes, or ${RERUN}.`
    );
  }

  if (lock) await succeeds(dropLockDir(host, lock.path)).catch(() => false);
  return sha256Hex(newUrl);
}

/** The admin: the Management API on the target's project, the cms's own url for a cms role, or the url given */
function adminSpecOf(
  target: DbRoleTarget,
  given: string,
  url: string,
  key: DbRoleKey
): AdminSpec {
  if (given === SUPABASE_ADMIN) {
    const ref = projectRefOf(url, key);
    if (!ref) {
      throw new CliError(
        `${key} is not a Supabase url, so the Management API cannot reach its database`,
        EXIT.failed,
        'Pass an admin url with --admin-url'
      );
    }
    return { kind: 'api', ref };
  }
  if (given !== CMS_ADMIN) return { kind: 'psql', url: given };
  if (!CMS_TARGETS.includes(target)) {
    throw new UsageError(
      `The ${target} role has no cms admin url`,
      'Leave --admin-url out to go through the Supabase Management API, or pass the owner url of the agent-queue Supabase database'
    );
  }
  const cmsUrl = readSharedValue({
    ...CMS_ADMIN_SECRET,
    projectId: PROJECTS.codeware.id
  });
  if (!cmsUrl) {
    throw new CliError(
      `${CMS_ADMIN_SECRET.key} is not in codeware ${CMS_ADMIN_SECRET.path} (${CMS_ADMIN_SECRET.environment})`,
      EXIT.failed,
      'Pass an admin url with --admin-url'
    );
  }
  return { kind: 'psql', url: cmsUrl };
}

/**
 * Postgres keeps one password per role, so the old url stops working the
 * moment the role is altered. The whole run holds the host deploy lock and
 * keeps the queue paused and idle from before the alter until the new url
 * logs in. The
 * password reaches the server only as a SCRAM verifier, on psql's stdin or in
 * the Management API's request body. A run
 * that stops part way is fixed by running it again: the admin can always set
 * a new password, so there is no stage to resume.
 */
export default defineCommand({
  summary: 'A new password for an agent-host database role',
  description: `Sets a generated password on the role behind an agent-host database url (${TARGET_NAMES.map((t) => `${t}: ${DB_ROLE_TARGETS[t].key}`).join(', ')}) over an admin connection, writes the new url to agent-host Infisical ${VAULT.path} through your own \`infisical login\`, restarts the agent container and logs in with the new url, with the queue idle and all under the host deploy lock, and checks that the container holds the new url (by hash). The admin url of the platform and backup roles defaults to the cms's ${CMS_ADMIN_SECRET.key}; the desk role goes through the Supabase Management API as "${SUPABASE_ADMIN_ROLE}" with your own \`supabase login\`, unless --admin-url names a url. No url or password is ever printed.`,
  danger: 'destructive',
  needs: ['psql'],
  inputs: {
    target: input.enum(TARGET_NAMES, {
      prompt: 'Which role?',
      description: 'The url to rotate, by what uses it',
      positional: true,
      hints: Object.fromEntries(
        TARGET_NAMES.map((t) => [
          t,
          `${DB_ROLE_TARGETS[t].key}, ${DB_ROLE_TARGETS[t].uses}`
        ])
      )
    }),
    host: hostInput('The host whose agent container uses the url'),
    adminUrl: input.secret({
      prompt:
        'Admin url of the database (the owner, or a role that may alter the target)?',
      description: `A postgres:// url that may alter the role, run through psql; \`${CMS_ADMIN}\` (the default for platform and backup) is the cms's ${CMS_ADMIN_SECRET.key}, and \`${SUPABASE_ADMIN}\` (the default for desk) is the Supabase Management API as "${SUPABASE_ADMIN_ROLE}" with your own \`supabase login\`. Give a Supabase pooler url: the direct host is IPv6 only. Every target has a default, so it is never asked for; pass it as --admin-url "$(pbpaste)" to keep the url out of shell history`,
      short: 'a',
      default: (resolved) =>
        CMS_TARGETS.includes(resolved['target'] as DbRoleTarget)
          ? CMS_ADMIN
          : SUPABASE_ADMIN
    }),
    wait: input.number({
      prompt: 'Minutes to wait for the queue to be idle?',
      short: 'w',
      description: 'Minutes to wait for a running job before giving up',
      default: DEFAULT_WAIT_MINUTES
    })
  },

  async plan(ctx, { target, host, adminUrl: given, wait }) {
    if (!host) {
      throw new UsageError(
        'Missing --host',
        'Name the host that runs the agent container, such as --host agent-host'
      );
    }
    assertHost(host);
    const { key } = DB_ROLE_TARGETS[target];
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

    const url = await ctx.ui.task(`Reading ${key}`, async () =>
      readSharedValue({ ...VAULT, key })
    );
    if (!url) {
      throw new CliError(
        `${key} is not in agent-host ${VAULT.path} (${VAULT.environment})`,
        EXIT.failed,
        'There is no role to rotate until the url is in the vault'
      );
    }
    let role: string;
    let server: string;
    try {
      role = roleOf(url, key);
      server = hostOf(url, key);
    } catch (error) {
      throw new CliError(messageOf(error), EXIT.failed);
    }

    const spec = await ctx.ui.task(
      given === SUPABASE_ADMIN
        ? 'Reading the Supabase project'
        : 'Reading the admin url',
      async () => adminSpecOf(target, given, url, key)
    );
    let adminConnection: Admin;
    let match: ServerMatch = { ok: true };
    try {
      adminConnection = await adminOf(ctx, spec);
      // The API's project comes from the target url itself, so only a url can
      // point at another server
      if (spec.kind === 'psql') match = sameServer(spec.url, url);
    } catch (error) {
      throw new CliError(messageOf(error), EXIT.failed);
    }
    if (!match.ok) {
      throw new CliError(
        `The admin url is for another database server: ${match.why}`,
        EXIT.failed,
        'Pass the admin url of the server the role lives on'
      );
    }
    const admin = adminConnection.name;
    const via =
      spec.kind === 'api'
        ? `the Management API on Supabase project ${spec.ref}`
        : server;

    const rights = await ctx.ui.task(
      `Reading what "${admin}" may do to "${role}"`,
      () => adminConnection.rights(role)
    );
    if (!rights.exists) {
      throw new CliError(
        `There is no role "${role}" on ${via}`,
        EXIT.failed,
        spec.kind === 'api'
          ? `${key} logs in as a role its Supabase project does not have`
          : `${key} logs in as a role the admin url's server does not have`
      );
    }
    if (role === admin) {
      throw new CliError(
        `${key} logs in as "${role}", the admin role itself`,
        EXIT.failed,
        'Rotating it would break every other url of that role, the cms among them; give the agent host its own role'
      );
    }
    const sharing = await ctx.ui.task(
      `Checking no other agent-host url logs in as "${role}"`,
      async () =>
        TARGET_NAMES.filter((other) => other !== target).flatMap((other) => {
          const otherKey = DB_ROLE_TARGETS[other].key;
          const otherUrl = readSharedValue({ ...VAULT, key: otherKey });
          if (!otherUrl) return [];
          try {
            return roleOf(otherUrl, otherKey) === role &&
              sameServer(otherUrl, url).ok
              ? [otherKey]
              : [];
          } catch {
            return [];
          }
        })
    );
    if (sharing.length > 0) {
      throw new CliError(
        `${key} logs in as "${role}", and so does ${sharing.join(' and ')}`,
        EXIT.failed,
        'A new password would break the other url; give each url its own role'
      );
    }
    if (!rights.canAlter) {
      throw new CliError(
        `"${admin}" may not set the password of "${role}"`,
        EXIT.failed,
        'It needs superuser, or CREATEROLE with the ADMIN option on the role; pass an --admin-url that has it'
      );
    }

    // The old url dies at the alter, so a container that reads it from
    // elsewhere than the vault must be found before anything changes
    const elsewhere = await ctx.ui.task(
      `Checking ${CONTAINER} reads ${key} from the vault`,
      () => containerProblem(host, key, sha256Hex(url), 'vault url')
    );
    if (elsewhere) {
      throw new CliError(
        `Before anything changed: ${elsewhere}`,
        EXIT.failed,
        `The rotation would leave the container on a dead url. When an earlier run stopped before its restart, restart first: ssh ${host} docker restart ${CONTAINER}`
      );
    }

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
          label: `Pause the queue on ${host} and wait for it to be idle`,
          detail: `up to ${wait} minutes`
        },
        ...(QUEUE_LOCKS[target]
          ? [
              {
                label: `Hold ${QUEUE_LOCKS[target].path} until the role logs in`,
                detail: `${QUEUE_LOCKS[target].what.toLowerCase()} does not run on a dead url`
              }
            ]
          : []),
        {
          label: `Set a new password on "${role}" as "${admin}"`,
          detail: `${via}; a SCRAM verifier, ${spec.kind === 'api' ? 'in the request body' : "on psql's stdin"}. The old url stops working here`
        },
        {
          label: `Write the new url as ${key}, read it back`,
          detail: 'only the password changes'
        },
        {
          label: `Restart ${CONTAINER} on ${host}`,
          detail: 'the queue stays paused'
        },
        {
          label: `Log in as "${role}" with the new url, then resume the queue`,
          detail: `retried for up to ${(LOGIN_TRIES * LOGIN_PAUSE_MS) / 1000} s while a pooler catches up`
        },
        {
          label: `Check the container's ${VAULT_FILE} holds the new url`,
          detail: 'sha256 compared, never the value'
        }
      ],
      notes: [
        ...(target === 'backup'
          ? [
              'The nightly backup is not forced; the next one is the first to use the new url'
            ]
          : []),
        'A run that stops after the password is set leaves the container on a dead url; run it again to finish'
      ],
      target: { environment: 'production', name: target },
      json: {
        host,
        target,
        key,
        role,
        admin,
        server,
        via: spec.kind
      },
      data: {
        host,
        wait,
        target,
        key,
        role,
        url,
        admin: adminConnection
      } satisfies Data
    };
  },

  async apply(ctx, data) {
    const { host, wait, target, key, role } = data;
    const release = await lockHost(ctx, host, wait);
    try {
      await ctx.ui.task(
        `Checking agent-host ${VAULT.path} accepts writes`,
        async () => probeWrite(VAULT)
      );
      const lock = QUEUE_LOCKS[target];
      if (target === 'backup' && lock && (await lockBusy(host, lock))) {
        throw new CliError(
          `${lock.what} is running; nothing was changed`,
          EXIT.failed,
          'Try again once it is done'
        );
      }
      const { value: hash, resumed } = await whileIdle(ctx, host, wait, () =>
        alterWriteRestart(ctx, data)
      );
      const problem = await containerProblem(host, key, hash, 'url');
      if (problem || !resumed) {
        throw new CliError(
          `Set a new password on "${role}" and wrote ${key} on ${host}, but ${problem ?? 'the queue may still be paused (see the warning)'}`,
          EXIT.failed,
          problem
            ? 'The vault holds the new url and the role takes it; fix that, then restart the container'
            : undefined
        );
      }
      return {
        summary: `New password on "${role}"; ${key} rewritten and ${CONTAINER} restarted on ${host}`,
        json: { host, target, key, role }
      };
    } finally {
      await release();
    }
  }
});
