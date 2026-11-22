// The limits and predicates both the status and the problems of a tenant row rest on

/** The share of the usable connection limit from which the shared row warns */
export const DB_CONNECTIONS_WARN_SHARE = 0.8;

/** The connections from which the shared row warns, for a usable limit */
export const connectionsWarnAt = (limit: number): number =>
  Math.ceil(limit * DB_CONNECTIONS_WARN_SHARE);

/** Hours after which the newest database backup is stale: the NUC dumps nightly after 02:00, plus slack */
export const BACKUP_STALE_HOURS = 26;

/** Fly's own word for a certificate that serves */
export const certReady = (state: string): boolean =>
  state.toLowerCase() === 'ready';

/** A certificate that is not ready; `unknown` (Fly was not read) is not one */
export const certPending = (state: string): boolean =>
  !certReady(state) && state !== 'unknown';
