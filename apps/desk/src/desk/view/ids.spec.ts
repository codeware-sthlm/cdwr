import { describe, expect, it } from 'vitest';

import { canonicalId, isTicketId } from './ids';

describe('canonicalId', () => {
  it.each([
    ['797', 'COD-797'],
    ['cod-797', 'COD-797'],
    ['COD-797', 'COD-797'],
    [' 0797 ', 'COD-797'],
    ['', null],
    ['cod-', null],
    ['797 x', null],
    ['login', null]
  ])('reads %j as %j', (query, id) => {
    expect(canonicalId(query)).toBe(id);
  });
});

describe('isTicketId', () => {
  it('accepts a well-formed ticket id only', () => {
    expect(isTicketId('COD-1')).toBe(true);
    expect(isTicketId('cod-12')).toBe(false);
    expect(isTicketId('COD-1 x')).toBe(false);
    expect(isTicketId('')).toBe(false);
  });
});
