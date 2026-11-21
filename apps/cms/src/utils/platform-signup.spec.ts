import {
  PLATFORM_SIGNUP_PATH,
  PLATFORM_SIGNUP_RESEND_PATH,
  PLATFORM_SIGNUP_VERIFY_PATH,
  signupRewrite
} from './platform-signup';

describe('signupRewrite', () => {
  it('points /signup at the platform page on the host', () => {
    expect(signupRewrite('/signup', {})).toBe(PLATFORM_SIGNUP_PATH);
  });

  it('points /signup/resend at the platform resend page on the host', () => {
    expect(signupRewrite('/signup/resend', {})).toBe(
      PLATFORM_SIGNUP_RESEND_PATH
    );
  });

  it('points /signup/verify/<token> at the platform verify page on the host', () => {
    expect(signupRewrite('/signup/verify/abc123', {})).toBe(
      `${PLATFORM_SIGNUP_VERIFY_PATH}/abc123`
    );
  });

  it.each(['/signup', '/signup/resend', '/signup/verify/abc123'])(
    "leaves a tenant site's own %s page alone",
    (pathname) => {
      expect(signupRewrite(pathname, { TENANT_ID: 'moon' })).toBeNull();
    }
  );

  it.each([
    '/',
    '/signup/more',
    '/signup/verify',
    '/signup/verify/a/b',
    '/platform-signup',
    '/platform-signup/resend'
  ])('leaves %s alone', (pathname) => {
    expect(signupRewrite(pathname, {})).toBeNull();
  });
});
