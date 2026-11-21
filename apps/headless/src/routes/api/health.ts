import { createFileRoute } from '@tanstack/react-router';

/** Answers without the cms, so the platform's check tells if this app is up */
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () => Response.json({ status: 'ok' })
    }
  }
});
