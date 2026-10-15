import { PLATFORM_SIGNUP_PATH, signupRewrite } from './platform-signup';

describe('signupRewrite', () => {
  it('points /signup at the platform page on the host', () => {
    expect(signupRewrite('/signup', {})).toBe(PLATFORM_SIGNUP_PATH);
  });

  it("leaves a tenant site's own /signup page alone", () => {
    expect(signupRewrite('/signup', { TENANT_ID: 'moon' })).toBeNull();
  });

  it.each(['/', '/signup/more', '/platform-signup'])(
    'leaves %s alone',
    (pathname) => {
      expect(signupRewrite(pathname, {})).toBeNull();
    }
  );
});
