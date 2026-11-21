import type { JobHost } from '../desk/types';

/**
 * The host a platform command goes to: the NUC writes `tenant_state` from its scheduler's platform
 * step, and the scheduler that applies commands is the container's. So it is the host whose
 * `queue_state` the desk reads (`runs.host`) while that scheduler's job runs in the container; a
 * launchd job (the Mac's) does not apply them, and without a host or a job there is none.
 */
export const platformHost = (
  queueHost: string | null,
  job: JobHost | null
): string | null => (queueHost && job === 'container' ? queueHost : null);
