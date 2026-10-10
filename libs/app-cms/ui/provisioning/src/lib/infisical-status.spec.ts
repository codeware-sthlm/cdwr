import {
  type InfisicalAppFacts,
  type InfisicalStatus,
  byWorstInfisicalState,
  summarizeInfisicalStatus,
  toInfisicalStatusItems
} from './infisical-status';

const app = (
  overrides: Partial<InfisicalAppFacts> = {}
): InfisicalAppFacts => ({
  app: 'cms',
  flyApp: 'cdwr-cms-demo',
  included: true,
  apiKey: 'matches',
  optionalKeys: [],
  ...overrides
});

const status = (
  environments: InfisicalStatus['environments']
): InfisicalStatus => ({
  deployment: 'demo',
  checkedAt: '2026-09-13T21:00:00.000Z',
  environments
});

describe('toInfisicalStatusItems', () => {
  it('reads an app folder by its key and its flag', () => {
    const items = toInfisicalStatusItems(
      status([
        {
          environment: 'production',
          access: 'ok',
          apps: [
            app({ optionalKeys: ['RESTRICTED_FONTS'] }),
            app({ app: 'web', apiKey: 'mismatch' })
          ]
        },
        {
          environment: 'preview',
          access: 'ok',
          apps: [app({ included: false, apiKey: 'missing' })]
        }
      ])
    );

    expect(items.map(({ app, state }) => [app, state])).toEqual([
      ['cms', 'ready'],
      ['web', 'key-mismatch'],
      ['cms', 'not-deployed']
    ]);
    expect(items[0].optionalKeys).toEqual(['RESTRICTED_FONTS']);
  });

  it('reads an environment without folders as not provisioned', () => {
    const [item] = toInfisicalStatusItems(
      status([{ environment: 'preview', access: 'ok', apps: [] }])
    );

    expect(item).toMatchObject({ app: null, state: 'not-provisioned' });
  });

  it('reports an environment that is unreadable as one row', () => {
    expect(
      toInfisicalStatusItems(
        status([{ environment: 'preview', access: 'unreadable' }])
      )
    ).toEqual([
      {
        environment: 'preview',
        app: null,
        flyApp: null,
        state: 'unreadable',
        optionalKeys: []
      }
    ]);
  });
});

describe('summarizeInfisicalStatus', () => {
  it('names the worst state with its count', () => {
    const items = toInfisicalStatusItems(
      status([
        {
          environment: 'production',
          access: 'ok',
          apps: [app(), app({ app: 'web', apiKey: 'missing' })]
        },
        { environment: 'preview', access: 'unreadable' }
      ])
    );

    expect(summarizeInfisicalStatus(items)).toEqual({
      tone: 'error',
      state: 'missing-key',
      count: 1
    });
    expect([...items].sort(byWorstInfisicalState)[0].state).toBe('missing-key');
  });

  it('is green when every deployed app is ready', () => {
    const items = toInfisicalStatusItems(
      status([
        {
          environment: 'production',
          access: 'ok',
          apps: [app()]
        },
        { environment: 'preview', access: 'ok', apps: [] }
      ])
    );

    expect(summarizeInfisicalStatus(items)).toEqual({
      tone: 'ok',
      state: 'ready',
      count: 1
    });
  });

  it('is neutral when nothing is set up', () => {
    expect(summarizeInfisicalStatus([])).toMatchObject({ tone: 'neutral' });
  });
});
