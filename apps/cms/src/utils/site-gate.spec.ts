/** @jest-environment node */
import {
  SITE_GATE_PATH,
  SITE_GATE_SUBMIT_PATH,
  isGatedPath
} from './site-gate';

describe('isGatedPath', () => {
  it.each([
    '/monitoring',
    '/monitoring/',
    '/monitoring/x',
    '/admin',
    '/admin/collections/pages',
    '/api/health',
    '/stats',
    SITE_GATE_PATH,
    SITE_GATE_SUBMIT_PATH,
    '/cdwr-cloud.png'
  ])('leaves %s open', (path) => {
    expect(isGatedPath(path)).toBe(false);
  });

  it.each(['/', '/about', '/monitoring-other', '/statsx', '/admins'])(
    'gates %s',
    (path) => {
      expect(isGatedPath(path)).toBe(true);
    }
  );
});
