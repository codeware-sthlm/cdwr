/** @jest-environment node */
import { type BuildDeps, runComponentBuild } from './run-component-build';

jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: jest.fn()
}));

const input = { tagName: 'cdwr-x-counter', source: 'src' };

const built = {
  ok: true,
  js: 'js',
  css: 'css',
  hash: '0123456789abcdef',
  diagnostics: []
} as const;

const depsWith = (service: BuildDeps['service']) => {
  const buildLocally = jest.fn().mockResolvedValue(built);
  const fetchMock = jest.fn().mockResolvedValue(Response.json(built));
  return {
    buildLocally,
    fetchMock,
    deps: { buildLocally, service, fetch: fetchMock }
  };
};

describe('runComponentBuild', () => {
  it('builds with the local toolchain when no service is configured', async () => {
    const { deps, buildLocally, fetchMock } = depsWith(() => undefined);

    await expect(runComponentBuild(input, deps)).resolves.toEqual(built);

    expect(buildLocally).toHaveBeenCalledWith(input);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hands the build to the service when one is configured', async () => {
    const { deps, buildLocally, fetchMock } = depsWith(() => ({
      url: 'http://builder:3002',
      token: 't'
    }));

    await expect(runComponentBuild(input, deps)).resolves.toEqual(built);

    expect(buildLocally).not.toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'http://builder:3002/build'
    );
  });

  it('does not fall back to the local toolchain when the service fails', async () => {
    const { deps, buildLocally } = depsWith(() => ({
      url: 'http://builder:3002',
      token: 't'
    }));
    deps.fetch = jest.fn().mockRejectedValue(new Error('refused'));

    const result = await runComponentBuild(input, deps);

    expect(result.ok).toBe(false);
    expect(buildLocally).not.toHaveBeenCalled();
  });
});
