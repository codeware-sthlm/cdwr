import type { Block } from 'payload';
import { describe, expect, it } from 'vitest';

import * as blocks from '../index';

const all = Object.values(blocks) as Array<Block>;

describe('block images', () => {
  it.each(all.map((block) => [block.slug, block] as const))(
    '%s points at its thumbnail and icon',
    (slug, block) => {
      expect(block.admin?.images).toEqual({
        thumbnail: { url: `/blocks/${slug}.svg`, alt: expect.any(String) },
        icon: `/blocks/${slug}.icon.svg`
      });

      const thumbnail = block.admin?.images?.thumbnail;
      expect(
        typeof thumbnail === 'object' && thumbnail.alt?.trim()
      ).toBeTruthy();
    }
  );
});
