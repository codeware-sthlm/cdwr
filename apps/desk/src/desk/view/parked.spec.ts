import { describe, expect, it } from 'vitest';

import { parkedPlain } from './parked';

describe('parkedPlain', () => {
  it('says what a parked ticket waits on', () => {
    expect(parkedPlain({ ticket: 'A', wait: 'ci' })).toBe('waits on CI');
    expect(parkedPlain({ ticket: 'A', wait: 'ci', resolved: true })).toBe(
      'CI done, resumes next'
    );
  });
});
