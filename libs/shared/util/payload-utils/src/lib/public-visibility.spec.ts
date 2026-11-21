import { describe, expect, it } from 'vitest';

import { publicVisibilityWhere } from './public-visibility';

describe('publicVisibilityWhere', () => {
  it('treats a missing visibility value as public', () => {
    // Documents predating the field; nothing was restricted before it existed
    expect(publicVisibilityWhere).toEqual({
      or: [
        { visibility: { equals: 'public' } },
        { visibility: { exists: false } }
      ]
    });
  });
});
