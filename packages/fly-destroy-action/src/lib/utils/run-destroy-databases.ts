import * as core from '@actions/core';
import { Fly } from '@cdwr/fly-node';
import { getPullRequest } from '@codeware/shared/util/github';
import { dropRoleStatement, dropStatement } from '@codeware/shared/util/pure';

const PR_PLACEHOLDER = '${PR_NUMBER}';

/** Roles Fly creates on attach: the app name in snake case, e.g. `cdwr_cms_pr_575_moon` */
const PREVIEW_ROLE = /^[a-z0-9_]+_pr_(\d+)(?:_[a-z0-9_]+)?$/;

/** Single-quote a string for the remote shell */
const shellQuote = (value: string): string =>
  `'${value.replace(/'/g, `'\\''`)}'`;

/**
 * A psql call run inside the cluster machine, authenticated with the
 * cluster's own `OPERATOR_PASSWORD`, so the password never leaves it.
 */
export const psqlCommand = (sql: string): string =>
  `sh -c ${shellQuote(
    `PGPASSWORD="$OPERATOR_PASSWORD" psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -c ${shellQuote(sql)}`
  )}`;

/**
 * Turn a database name template into a matcher for the PR number.
 *
 * @throws When the template has no `${PR_NUMBER}`, so a fixed name can never match
 */
export const databaseMatcher = (template: string): RegExp => {
  const parts = template.split(PR_PLACEHOLDER);
  if (parts.length !== 2) {
    throw new Error(
      `Database name template must contain ${PR_PLACEHOLDER} exactly once: '${template}'`
    );
  }
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escape(parts[0])}(\\d+)${escape(parts[1])}$`);
};

const lines = (output: string): string[] =>
  output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** One GitHub lookup per PR for the whole run; a failed lookup reads as unknown */
const prStates = (token: string) => {
  const cache = new Map<number, string | null>();
  return async (prNumber: number): Promise<string | null> => {
    if (!cache.has(prNumber)) {
      const state = await getPullRequest(token, prNumber).then(
        (pullRequest) => pullRequest?.state ?? null,
        (error) => {
          core.warning(`Pull request #${prNumber}: ${errorMessage(error)}`);
          return null;
        }
      );
      cache.set(prNumber, state);
    }
    return cache.get(prNumber) ?? null;
  };
};

/** Keep the names whose PR is closed, one lookup at a time; an unknown PR keeps the name out */
const closedOnly = async (
  prState: (prNumber: number) => Promise<string | null>,
  names: string[],
  matcher: RegExp
): Promise<string[]> => {
  const closed: string[] = [];
  for (const name of names) {
    const prNumber = name.match(matcher)?.[1];
    if (!prNumber) {
      continue;
    }
    const state = await prState(Number(prNumber));
    if (!state) {
      core.warning(`Pull request #${prNumber} not found, keep '${name}'`);
    } else if (state === 'closed') {
      closed.push(name);
    }
  }
  return closed;
};

/**
 * Drop preview databases and roles that belong to a closed pull request.
 *
 * Every run sweeps the whole cluster, so a run that failed earlier is retried.
 * A failed listing, lookup or drop is a warning, never a failed job.
 *
 * @param token - GitHub token for API access
 * @param fly - Fly instance
 * @param options.cluster - The preview Postgres cluster app
 * @param options.template - Database name template containing `${PR_NUMBER}`
 * @param options.dryRun - List what would be dropped without dropping it
 * @returns Dropped and skipped database names
 */
export const runDestroyDatabases = async (
  token: string,
  fly: Fly,
  options: { cluster: string; template: string; dryRun: boolean }
): Promise<{ dropped: string[]; skipped: string[] }> => {
  const { cluster, template, dryRun } = options;
  const matcher = databaseMatcher(template);
  const dropped: string[] = [];
  const skipped: string[] = [];

  const exec = (sql: string) => fly.ssh.exec(cluster, psqlCommand(sql));
  const prState = prStates(token);

  /** A listing that fails is a warning: nothing of that kind is dropped this run */
  const list = async (what: string, sql: string): Promise<string[]> => {
    try {
      return lines(await exec(sql));
    } catch (error) {
      core.warning(
        `Could not list ${what} on '${cluster}': ${errorMessage(error)}`
      );
      return [];
    }
  };

  const databases = await closedOnly(
    prState,
    await list(
      'databases',
      'SELECT datname FROM pg_database WHERE NOT datistemplate;'
    ),
    matcher
  );
  core.info(`Found ${databases.length} databases to drop on '${cluster}'`);

  for (const name of databases) {
    if (dryRun) {
      core.info(`[${name}] Would drop database (dry run)`);
      continue;
    }
    try {
      await exec(dropStatement(name));
      core.info(`[${name}] 🗑️ Database dropped`);
      dropped.push(name);
    } catch (error) {
      core.warning(
        `[${name}] ❌ Failed to drop database: ${errorMessage(error)}`
      );
      skipped.push(name);
    }
  }

  const roles = await closedOnly(
    prState,
    await list(
      'roles',
      "SELECT rolname FROM pg_roles WHERE rolname !~ '^pg_';"
    ),
    PREVIEW_ROLE
  );
  core.info(`Found ${roles.length} roles to drop on '${cluster}'`);

  for (const role of roles) {
    if (dryRun) {
      core.info(`[${role}] Would drop role (dry run)`);
      continue;
    }
    try {
      await exec(dropRoleStatement(role));
      core.info(`[${role}] 🗑️ Role dropped`);
    } catch (error) {
      // Still granted on an open PR's database; the next sweep retries it
      core.warning(`[${role}] Failed to drop role: ${errorMessage(error)}`);
    }
  }

  core.info(`Dropped ${dropped.length} databases`);

  return { dropped, skipped };
};

/**
 * Report the cluster's data volume usage, warning at 80% or more.
 *
 * @returns The used percentage, or `null` when it could not be read
 */
export const reportVolumeUsage = async (
  fly: Fly,
  cluster: string
): Promise<number | null> => {
  try {
    const output = await fly.ssh.exec(cluster, 'df -P /data');
    const row = lines(output).at(-1)?.split(/\s+/);
    const used = Number(row?.[4]?.replace('%', ''));
    if (!row || Number.isNaN(used)) {
      core.warning(`Could not read volume usage on '${cluster}'`);
      return null;
    }
    const message = `Volume on '${cluster}' is ${used}% used (${row[2]} of ${row[1]} KiB blocks)`;
    if (used >= 80) {
      core.warning(`${message}; databases turn read-only when it fills`);
    } else {
      core.info(message);
    }
    await core.summary
      .addHeading('Preview database volume', 3)
      .addRaw(`${message}\n`)
      .write();
    return used;
  } catch (error) {
    core.warning(
      `Could not read volume usage on '${cluster}': ${errorMessage(error)}`
    );
    return null;
  }
};
