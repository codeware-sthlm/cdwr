import { describe, expect, it } from 'vitest';

import { techIconsMap } from './tech-icons';

describe('techIconsMap', () => {
  it('marks a near-black brand as dark and a bright one as not', () => {
    expect(techIconsMap.nextjs.dark).toBe(true);
    expect(techIconsMap.github.dark).toBe(true);
    expect(techIconsMap.supabase.dark).toBe(false);
    expect(techIconsMap.tailwind.dark).toBe(false);
  });
});
