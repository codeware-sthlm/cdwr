import { sectionBandName } from '@codeware/app-cms/ui/fields';
import type { Block } from 'payload';
import { describe, expect, it } from 'vitest';

import * as blocks from '../index';

/**
 * The blocks that never draw a band: a gap, a container whose own blocks carry
 * theirs, and the gallery, which frames every example itself.
 */
const unbanded = ['block-gallery', 'reusable-content', 'spacing'];

const all = Object.values(blocks) as Array<Block>;

describe('section band', () => {
  it.each(all.map((block) => [block.slug, block] as const))(
    '%s has a band unless it is one of the exceptions',
    (slug, block) => {
      const hasBand = block.fields.some(
        (field) => 'name' in field && field.name === sectionBandName
      );
      expect(hasBand).toBe(!unbanded.includes(slug));
    }
  );
});
