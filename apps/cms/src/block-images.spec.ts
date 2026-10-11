import { existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

import { BLOCK_META } from '@codeware/shared/util/payload-utils';

/**
 * Every block names a thumbnail and an icon under `public/blocks`.
 *
 * `nx sync` (block-images-sync) writes them; a block added without syncing
 * would show a broken image in the admin's block picker, and a layout left
 * behind for a removed block would keep shipping its images.
 */

const blocksDir = join(resolve(__dirname, '..'), 'public/blocks');

const files = Object.keys(BLOCK_META).flatMap((slug) => [
  `${slug}.svg`,
  `${slug}.icon.svg`
]);

describe('block images', () => {
  it.each(files)('has %s', (file) => {
    expect(existsSync(join(blocksDir, file))).toBe(true);
  });

  it('holds no image for a block that is not registered', () => {
    expect(readdirSync(blocksDir).sort()).toEqual([...files].sort());
  });
});
