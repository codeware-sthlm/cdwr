/** @jest-environment node */
import { createSiteGateToken } from '@codeware/shared/util/site-gate';

import { passesSiteGate } from './site-gated';

describe('passesSiteGate', () => {
  const password = 'open sesame';

  afterEach(() => {
    delete process.env.SITE_GATE_PASSWORD;
  });

  it('lets anyone through when the site has no gate', () => {
    expect(passesSiteGate(undefined)).toBe(true);
  });

  describe('with a gate', () => {
    beforeEach(() => {
      process.env.SITE_GATE_PASSWORD = password;
    });

    it('lets a visitor with a valid cookie through', () => {
      expect(passesSiteGate(createSiteGateToken(password))).toBe(true);
    });

    it('refuses a missing cookie', () => {
      expect(passesSiteGate(undefined)).toBe(false);
      expect(passesSiteGate('')).toBe(false);
    });

    it('refuses a cookie signed with another password', () => {
      expect(passesSiteGate(createSiteGateToken('another'))).toBe(false);
    });
  });
});
