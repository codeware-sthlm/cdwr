import { UsageError } from '../../cli/errors';

import {
  deploymentLabel,
  dispatchInputs,
  findStartedRun,
  releaseGroupApps,
  resolvePullRequest
} from './deploy.logic';

describe('releaseGroupApps', () => {
  it('reads the projects of the apps group', () => {
    const nx = { release: { groups: { apps: { projects: ['cms', 'web'] } } } };
    expect(releaseGroupApps(nx)).toEqual(['cms', 'web']);
  });

  it('is empty when the group is missing or nx.json is unexpected', () => {
    expect(releaseGroupApps({ release: { groups: {} } })).toEqual([]);
    expect(releaseGroupApps({})).toEqual([]);
  });
});

describe('resolvePullRequest', () => {
  it('prefers the given pull request, then the current one', () => {
    expect(resolvePullRequest('preview', 5, 9)).toBe(5);
    expect(resolvePullRequest('preview', undefined, 9)).toBe(9);
  });

  it('refuses preview without any pull request', () => {
    expect(() => resolvePullRequest('preview', undefined, undefined)).toThrow(
      /--pr/
    );
  });

  it('refuses a pull request for production', () => {
    expect(() => resolvePullRequest('production', 5, undefined)).toThrow(
      UsageError
    );
    expect(resolvePullRequest('production', undefined, 9)).toBeUndefined();
  });
});

describe('dispatchInputs and deploymentLabel', () => {
  it('spells out the workflow inputs', () => {
    expect(
      dispatchInputs({
        app: 'cms',
        environment: 'preview',
        pr: 7,
        tenant: 'moon'
      })
    ).toEqual({
      app: 'cms',
      environment: 'preview',
      tenant: 'moon',
      'pr-number': '7'
    });
    expect(dispatchInputs({ app: 'web', environment: 'production' })).toEqual({
      app: 'web',
      environment: 'production'
    });
  });

  it('labels the plan step', () => {
    expect(
      deploymentLabel({
        app: 'builder',
        environment: 'preview',
        pr: 566,
        tenant: 'moon'
      })
    ).toBe('Dispatch Fly Deployment: builder → preview, PR #566, tenant moon');
  });
});

describe('findStartedRun', () => {
  const run = (id: number) => ({ id, status: 'queued', url: `u/${id}` });

  it('waits and retries until a new run shows up', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce([run(1)])
      .mockResolvedValueOnce([run(2), run(1)]);
    const wait = vi.fn(async () => undefined);
    expect(await findStartedRun(list, new Set([1]), wait)).toEqual(run(2));
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it('gives up with undefined', async () => {
    const list = vi.fn().mockResolvedValue([run(1)]);
    expect(
      await findStartedRun(list, new Set([1]), async () => undefined, 3)
    ).toBeUndefined();
    expect(list).toHaveBeenCalledTimes(3);
  });
});
