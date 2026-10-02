import { describe, expect, it } from 'vitest';

import { tsxModelUri } from './tsx-source';

describe('tsxModelUri', () => {
  it('ends in .tsx', () => {
    expect(tsxModelUri('source')).toBe('inmemory://cms/source.tsx');
  });

  it('flattens nested field paths into the uri path', () => {
    expect(tsxModelUri('a.b')).toBe('inmemory://cms/a/b.tsx');
  });
});
