import { describe, expect, it } from 'vitest';

import { isTicketId } from './ids';

describe('isTicketId', () => {
  it('accepts a well-formed ticket id only', () => {
    expect(isTicketId('COD-1')).toBe(true);
    expect(isTicketId('cod-12')).toBe(false);
    expect(isTicketId('COD-1 x')).toBe(false);
    expect(isTicketId('')).toBe(false);
  });
});
