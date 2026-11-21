import { describe, expect, it } from 'vitest';

import { platformHost } from './host';

describe('platformHost', () => {
  it('is the queue host while its scheduler runs in the container', () => {
    expect(platformHost('nuc', 'container')).toBe('nuc');
  });

  it('is none for a launchd job, an unknown job or no host', () => {
    expect(platformHost('mac', 'launchd')).toBeNull();
    expect(platformHost('nuc', null)).toBeNull();
    expect(platformHost(null, 'container')).toBeNull();
    expect(platformHost('', 'container')).toBeNull();
  });
});
