import handler, { createServerEntry } from '@tanstack/react-start/server-entry';

import { initSentryServer } from './server/sentry';

// Before the first request, so the global middleware has a client to report to
initSentryServer();

export default createServerEntry({ fetch: handler.fetch });
