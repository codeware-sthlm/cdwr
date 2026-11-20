import { basename } from 'node:path';

import { libpqEnv } from '../../services/libpq';

/** The env var holding the postgres:// url of the agent-queue Supabase database */
export const DB_URL_ENV = 'AGENT_SUPABASE_DB_URL';

/** A migration of the agent queue; anything else is not applied */
export const MIGRATION_FILE =
  /^tools\/cdwr\/agent-queue\/supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/;

/** psql flags: no psqlrc, quiet, stop at the first error, unaligned tuples only */
export const PSQL_ARGS = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'];

/** The ledger stores the file name without its folder */
export const migrationName = (file: string): string => basename(file);

/**
 * The libpq environment for psql. The url never reaches an argument list, and
 * the connection is encrypted unless the url's `sslmode` says otherwise.
 */
export const psqlEnv = (url: string): Record<string, string> => ({
  PGSSLMODE: 'require',
  ...libpqEnv(url)
});

// A psql meta-command (`\!`, `\o |cmd`, `\copy … program`, `\i`) runs on the host and psql reads
// one anywhere outside a quote, so any backslash is refused, even inside a string
const META_COMMAND = /\\\S*/;

// Dollar-quoted bodies, string and identifier literals and comments, which hide no statement
const LITERAL_OR_COMMENT =
  /\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$|'(?:[^']|'')*'|"(?:[^"]|"")*"|--[^\n]*|\/\*[\s\S]*?\*\//g;

// The transaction-control statements the wrapper's own transaction owns
const TRANSACTION_CONTROL =
  /^(begin|commit|rollback|abort|end|start\s+transaction|savepoint|release|prepare\s+transaction|set\s+(local\s+|session\s+)?transaction|set\s+session\s+characteristics)\b/;

/** The offending statement of a migration that manages its own transaction or runs a psql meta-command, or undefined */
export const transactionStatement = (sql: string): string | undefined => {
  const meta = META_COMMAND.exec(sql)?.[0];
  if (meta) return meta.toLowerCase();
  return sql
    .replace(LITERAL_OR_COMMENT, ' ')
    .split(';')
    .map((statement) => statement.trim().replace(/\s+/g, ' ').toLowerCase())
    .find((statement) => TRANSACTION_CONTROL.test(statement));
};

/** The question the plan asks the ledger, with the file name passed as `-v file=` */
export const LEDGER_QUERY =
  "select 1 from public.applied_migrations where file = :'file';\n";

/** The ledger table does not exist yet: the migration that creates it is the first one */
export const ledgerMissing = (stderr: string): boolean =>
  /applied_migrations.*does not exist/i.test(stderr);

/** What the dry run feeds psql: the migration in a transaction that is thrown away */
export const dryRunSql = (sql: string): string => `BEGIN;\n${sql}\nROLLBACK;\n`;

/** What the apply feeds psql: the migration and its ledger row, committed together */
export const applySql = (sql: string): string =>
  `BEGIN;\n${sql}\ninsert into public.applied_migrations (file) values (:'file');\nCOMMIT;\n`;

/** The first error line psql printed, else its first line */
export const firstErrorLine = (stderr: string): string => {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.find((line) => /\bERROR:/.test(line)) ?? lines[0] ?? 'no output';
};
