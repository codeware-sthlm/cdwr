// Not the ports of `nx dev cms` (3000) and `nx dev headless` (4300), nor of
// cms-e2e, so a running dev server is never mistaken for the one under test
export const CMS_PORT = '3001';
export const HEADLESS_PORT = '4301';

export const CMS_URL = `http://localhost:${CMS_PORT}`;

/** An empty `BASE_URL` falls back too */
export const BASE_URL =
  process.env['BASE_URL'] || `http://localhost:${HEADLESS_PORT}`;
