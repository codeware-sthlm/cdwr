import { SiteGateSchema } from './site-gate.schema';

describe('SiteGateSchema', () => {
  it('refuses a password under 8 characters', () => {
    expect(
      SiteGateSchema.safeParse({ SITE_GATE_PASSWORD: '1234567' }).success
    ).toBe(false);
  });

  it('accepts a password of 8 characters', () => {
    expect(SiteGateSchema.parse({ SITE_GATE_PASSWORD: '12345678' })).toEqual({
      SITE_GATE_PASSWORD: '12345678'
    });
  });

  it('treats a blank or absent password as unset', () => {
    expect(SiteGateSchema.parse({ SITE_GATE_PASSWORD: '' })).toEqual({});
    expect(SiteGateSchema.parse({})).toEqual({});
  });
});
