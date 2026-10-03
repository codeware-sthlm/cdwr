import { resolveBuildService } from './build-service';

describe('resolveBuildService', () => {
  it('uses the configured url anywhere', () => {
    expect(
      resolveBuildService({
        BUILDER_URL: 'https://builder.example',
        BUILDER_TOKEN: 't',
        DEPLOY_ENV: 'preview',
        PR_NUMBER: '7'
      })
    ).toEqual({ url: 'https://builder.example', token: 't' });
  });

  it('derives a preview builder from the pull request number', () => {
    expect(
      resolveBuildService({ DEPLOY_ENV: 'preview', PR_NUMBER: '566' })
    ).toEqual({ url: 'https://cdwr-builder-pr-566.fly.dev', token: undefined });
  });

  it('derives nothing outside preview, and nothing without env', () => {
    expect(
      resolveBuildService({ DEPLOY_ENV: 'production', PR_NUMBER: '566' })
    ).toBeUndefined();
    expect(resolveBuildService({ DEPLOY_ENV: 'development' })).toBeUndefined();
    expect(resolveBuildService(undefined)).toBeUndefined();
  });
});
