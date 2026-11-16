import { withoutTenantEnv } from './without-tenant-env';

describe('withoutTenantEnv', () => {
  it('drops each tenant env and keeps the rest', () => {
    expect(
      withoutTenantEnv({
        headless: [
          {
            tenant: 'moon',
            env: { SENTRY_DSN: 'https://key@sentry.example/1' },
            secretNames: ['PAYLOAD_API_KEY']
          }
        ],
        cms: [{}]
      })
    ).toEqual({
      headless: [{ tenant: 'moon', secretNames: ['PAYLOAD_API_KEY'] }],
      cms: [{}]
    });
  });
});
