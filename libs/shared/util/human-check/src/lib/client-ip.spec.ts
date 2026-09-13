import { describe, expect, it } from 'vitest';

import { clientIp } from './client-ip';

describe('clientIp', () => {
  it('prefers what the edge wrote over what the caller claims', () => {
    const headers = new Headers({
      'fly-client-ip': '203.0.113.7',
      'x-forwarded-for': '198.51.100.1'
    });

    expect(clientIp(headers)).toBe('203.0.113.7');
  });

  it('takes the original caller from a forwarded chain', () => {
    const headers = new Headers({
      'x-forwarded-for': '198.51.100.1, 70.41.3.18, 150.172.238.178'
    });

    expect(clientIp(headers)).toBe('198.51.100.1');
  });

  it('says nothing when no header does', () => {
    expect(clientIp(new Headers())).toBeUndefined();
  });
});
