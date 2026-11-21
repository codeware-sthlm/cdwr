import { SENTRY_UPLOAD_VARIABLES, sentryUploadEnabled } from './sentry-upload';

const all = Object.fromEntries(
  SENTRY_UPLOAD_VARIABLES.map((key) => [key, `${key.toLowerCase()}-value`])
);

describe('sentryUploadEnabled', () => {
  it('is on with every variable set', () => {
    expect(sentryUploadEnabled(all)).toBe(true);
  });

  it('is off with nothing set', () => {
    expect(sentryUploadEnabled({})).toBe(false);
  });

  it.each(SENTRY_UPLOAD_VARIABLES)('is off without %s', (key) => {
    expect(sentryUploadEnabled({ ...all, [key]: undefined })).toBe(false);
  });

  it.each(SENTRY_UPLOAD_VARIABLES)('is off with %s empty', (key) => {
    expect(sentryUploadEnabled({ ...all, [key]: '' })).toBe(false);
  });

  it('is off with only the shared credentials', () => {
    expect(
      sentryUploadEnabled({
        SENTRY_AUTH_TOKEN: 'token',
        SENTRY_ORG: 'org'
      })
    ).toBe(false);
  });
});
