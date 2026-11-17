// The limits and predicates both the status and the problems of a tenant row rest on

/** The session pooler's size; the NUC's platform step counts Supavisor's sessions against it */
export const DB_SESSIONS_MAX = 15;

/** Pooler sessions from which the shared row warns: three below the pool size */
export const DB_SESSIONS_WARN = 12;

/** Hours after which the newest database backup is stale: the NUC dumps nightly after 02:00, plus slack */
export const BACKUP_STALE_HOURS = 26;

/** Fly's own word for a certificate that serves */
export const certReady = (state: string): boolean =>
  state.toLowerCase() === 'ready';

/** A certificate that is not ready; `unknown` (Fly was not read) is not one */
export const certPending = (state: string): boolean =>
  !certReady(state) && state !== 'unknown';
