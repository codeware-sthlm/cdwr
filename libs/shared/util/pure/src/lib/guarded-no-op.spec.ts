import { describe, expect, it } from 'vitest';

import { CMS_GUARD_MESSAGE, isGuardedNoOpOutput } from './guarded-no-op';

describe('isGuardedNoOpOutput', () => {
  it('recognises the guard text', () => {
    expect(isGuardedNoOpOutput(`script ${CMS_GUARD_MESSAGE} (exit 0)`)).toBe(
      true
    );
  });

  it('ignores an ordinary error', () => {
    expect(isGuardedNoOpOutput('Error: tenant not found')).toBe(false);
  });
});
