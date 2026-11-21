import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

/** The agent-host database urls this command rotates, by what uses them */
export const DB_ROLE_TARGETS = {
  platform: {
    key: 'PLATFORM_DATABASE_URL',
    uses: 'the platform records'
  },
  backup: {
    key: 'PLATFORM_BACKUP_DATABASE_URL',
    uses: 'the nightly cms backup'
  },
  desk: {
    key: 'DESK_SUPABASE_DB_URL',
    uses: 'the desk migrations'
  }
} as const satisfies Record<string, { key: string; uses: string }>;

export type DbRoleTarget = keyof typeof DB_ROLE_TARGETS;
export type DbRoleKey = (typeof DB_ROLE_TARGETS)[DbRoleTarget]['key'];

export const TARGET_NAMES = Object.keys(DB_ROLE_TARGETS) as DbRoleTarget[];

/** The targets on the cms database, whose admin url defaults to the cms's own */
export const CMS_TARGETS: readonly DbRoleTarget[] = ['platform', 'backup'];

/** The `--admin-url` value that stands for the cms's `DATABASE_URL`, its IPv4 pooler */
export const CMS_ADMIN = 'cms';

export const CMS_ADMIN_SECRET = {
  path: '/apps/cms',
  environment: 'production',
  key: 'DATABASE_URL'
} as const;

const POOLER_HOST = /\.pooler\.supabase\.com$/i;
const DIRECT_HOST = /^db\.([a-z0-9]+)\.supabase\.co$/i;

/** A role name the SQL can quote without escaping */
const ROLE_NAME = /^[a-z_][a-z0-9_$]{0,62}$/;

const parse = (url: string, what: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Never the url itself: it holds a password
    throw new Error(`${what} does not parse`);
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new Error(`${what} is not a postgres:// url`);
  }
  if (!parsed.hostname) throw new Error(`${what} has no host`);
  return parsed;
};

/**
 * The role a url logs in as: its user, with a Supabase pooler's
 * `.<project ref>` suffix stripped. Only a plain lower-case name is accepted,
 * so the SQL quotes it without escaping.
 */
export function roleOf(url: string, what = 'the url'): string {
  const parsed = parse(url, what);
  const user = decodeURIComponent(parsed.username);
  const role = POOLER_HOST.test(parsed.hostname)
    ? user.replace(/\.[a-z0-9]+$/i, '')
    : user;
  if (!ROLE_NAME.test(role)) {
    throw new Error(
      role
        ? `${what} logs in as "${role}", not a plain lower-case role name`
        : `${what} has no user`
    );
  }
  return role;
}

/** The url's host and port, never its user or password */
export function hostOf(url: string, what = 'the url'): string {
  const parsed = parse(url, what);
  return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
}

/** The Supabase project a url points at: the pooler user's suffix, or the direct host's ref */
export function projectRefOf(
  url: string,
  what = 'the url'
): string | undefined {
  const parsed = parse(url, what);
  if (POOLER_HOST.test(parsed.hostname)) {
    return /\.([a-z0-9]+)$/i
      .exec(decodeURIComponent(parsed.username))?.[1]
      ?.toLowerCase();
  }
  return DIRECT_HOST.exec(parsed.hostname)?.[1]?.toLowerCase();
}

export type ServerMatch = { ok: true } | { ok: false; why: string };

/**
 * Whether both urls reach the same database server. Supabase's pooler and
 * direct hosts differ for one project, so a project ref decides when either
 * url has one; else the host and port must be equal.
 */
export function sameServer(admin: string, target: string): ServerMatch {
  const a = projectRefOf(admin, 'the admin url');
  const t = projectRefOf(target, 'the target url');
  if (a || t) {
    return a === t
      ? { ok: true }
      : {
          ok: false,
          why: `the admin url is for Supabase project ${a ?? '(none)'}, the target for ${t ?? '(none)'}`
        };
  }
  // libpq's default port, so `h` and `h:5432` are one server
  const server = (url: string, what: string) => {
    const parsed = parse(url, what);
    return `${parsed.hostname.toLowerCase()}:${parsed.port || '5432'}`;
  };
  const as = server(admin, 'the admin url');
  const ts = server(target, 'the target url');
  return as === ts
    ? { ok: true }
    : { ok: false, why: `the admin url reaches ${as}, the target ${ts}` };
}

/**
 * The url with its password replaced, URL-encoded, and every other character
 * kept as it was. `URL` would re-serialise the rest, so the authority is cut by hand.
 */
export function withPassword(url: string, password: string): string {
  parse(url, 'the target url');
  const start = url.indexOf('//') + 2;
  const rest = url.slice(start);
  const end = rest.search(/[/?#]/);
  const authority = end === -1 ? rest : rest.slice(0, end);
  const at = authority.lastIndexOf('@');
  if (at === -1) throw new Error('the target url has no user');
  const userinfo = authority.slice(0, at);
  const colon = userinfo.indexOf(':');
  const user = colon === -1 ? userinfo : userinfo.slice(0, colon);
  return `${url.slice(0, start)}${user}:${encodeURIComponent(password)}${rest.slice(at)}`;
}

/** A new role password: hex, so it needs no SASLprep and no URL encoding */
export const generatePassword = (): string => randomBytes(32).toString('hex');

export const SCRAM_ITERATIONS = 4096;

const hmac = (key: Buffer, text: string): Buffer =>
  createHmac('sha256', key).update(text).digest();

/**
 * The SCRAM-SHA-256 verifier Postgres stores for a password, in the form
 * `ALTER ROLE … PASSWORD` accepts as already hashed (RFC 5802, RFC 7677).
 * Only printable ASCII is taken, which SASLprep leaves as it is.
 */
export function scramVerifier(
  password: string,
  salt: Buffer = randomBytes(16),
  iterations: number = SCRAM_ITERATIONS
): string {
  if (!/^[\x21-\x7e]+$/.test(password)) {
    throw new Error('the password must be printable ASCII');
  }
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const storedKey = createHash('sha256')
    .update(hmac(salted, 'Client Key'))
    .digest();
  const serverKey = hmac(salted, 'Server Key');
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

const assertRole = (role: string): void => {
  if (!ROLE_NAME.test(role)) throw new Error(`"${role}" is not a role name`);
};

/** The statement that sets the verifier; for psql's stdin, never its arguments */
export function alterRoleSql(role: string, verifier: string): string {
  assertRole(role);
  if (
    !/^SCRAM-SHA-256\$\d+:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(
      verifier
    )
  ) {
    throw new Error('not a SCRAM-SHA-256 verifier');
  }
  return `ALTER ROLE "${role}" PASSWORD '${verifier}';\n`;
}

/**
 * One row, `exists|can_alter`, read as the admin. A non-superuser needs
 * CREATEROLE, a target that is no superuser, and from Postgres 16 the ADMIN
 * option on the target.
 */
export function adminRightsSql(role: string): string {
  assertRole(role);
  return `select
  exists (select 1 from pg_roles where rolname = '${role}'),
  coalesce((select a.rolsuper
    or (a.rolcreaterole
      and not coalesce((select t.rolsuper from pg_roles t where t.rolname = '${role}'), false)
      and (current_setting('server_version_num')::int < 160000
        or not exists (select 1 from pg_roles where rolname = '${role}')
        or pg_has_role(current_user, '${role}', 'MEMBER WITH ADMIN OPTION')))
    from pg_roles a where a.rolname = current_user), false);
`;
}

export interface AdminRights {
  exists: boolean;
  canAlter: boolean;
}

/** The row of `adminRightsSql` as psql prints it unaligned (`t|f`) */
export function parseAdminRights(stdout: string): AdminRights {
  const match = /^([tf])\|([tf])$/m.exec(stdout.trim());
  if (!match) throw new Error('the admin rights read returned no row');
  return { exists: match[1] === 't', canAlter: match[2] === 't' };
}
