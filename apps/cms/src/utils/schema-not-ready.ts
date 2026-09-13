/** Postgres codes for a table or column the query expects but cannot find */
const SCHEMA_NOT_READY_CODES = new Set(['42P01', '42703']);

/**
 * Whether an error only means the database schema is behind the config.
 *
 * Maintenance scripts such as `reset-db` boot Payload without pushing the
 * schema, against a database that is empty or not yet migrated, so a boot
 * lookup fails there for a reason that is not a fault. The database adapter
 * wraps the Postgres error, so the code is searched along the `cause` chain.
 */
export const isSchemaNotReady = (error: unknown): boolean => {
  let current: unknown = error;

  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current !== 'object') {
      return false;
    }

    const { code, cause } = current as { code?: unknown; cause?: unknown };

    if (typeof code === 'string' && SCHEMA_NOT_READY_CODES.has(code)) {
      return true;
    }

    current = cause;
  }

  return false;
};
