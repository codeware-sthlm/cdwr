import { describe, expect, it } from 'vitest';

import { muteUntil, nextMorning } from './controls';

describe('muteUntil', () => {
  const now = new Date(2026, 10, 22, 21, 30, 15);

  it('is null for none', () => {
    expect(muteUntil('none', now)).toBeNull();
  });

  it('counts hours from now in UTC', () => {
    expect(muteUntil('1h', now)).toBe(
      new Date(now.getTime() + 3600_000).toISOString()
    );
    expect(muteUntil('4h', now)).toBe(
      new Date(now.getTime() + 4 * 3600_000).toISOString()
    );
    expect(muteUntil('1h', now)).toMatch(/Z$/);
  });

  it('ends at the next 08:00 local', () => {
    expect(muteUntil('morning', now)).toBe(
      new Date(2026, 10, 23, 8, 0, 0, 0).toISOString()
    );
  });
});

describe('nextMorning', () => {
  it('is today before 08:00 and tomorrow from 08:00 on', () => {
    expect(nextMorning(new Date(2026, 10, 22, 7, 59))).toEqual(
      new Date(2026, 10, 22, 8, 0)
    );
    expect(nextMorning(new Date(2026, 10, 22, 8, 0))).toEqual(
      new Date(2026, 10, 23, 8, 0)
    );
  });
});
