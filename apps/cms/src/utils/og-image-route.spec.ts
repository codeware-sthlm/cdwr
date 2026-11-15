/** @jest-environment node */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { DEFAULT_OG_IMAGE_PATH } from '@codeware/shared/util/payload-utils';

// The share card is drawn by a route, not served from `public/`: a page with
// no image of its own points here, so the path and the folder must agree
describe('the default share image', () => {
  it('has a route under (site) for DEFAULT_OG_IMAGE_PATH', () => {
    const route = join(
      resolve(__dirname, '../app/(site)'),
      DEFAULT_OG_IMAGE_PATH,
      'route.tsx'
    );

    expect(existsSync(route)).toBe(true);
  });
});
