import {
  type TokenState,
  classifyApps,
  deriveStage,
  remainingSteps
} from './rotate-token.logic';

describe('deriveStage', () => {
  const state = (overrides: Partial<TokenState>): TokenState => ({
    active: 'old',
    previous: undefined,
    cms: 'old',
    ...overrides
  });

  it('throws when the builder token is missing', () => {
    expect(() => deriveStage(state({ active: undefined }))).toThrow(
      /not found/
    );
  });

  it('throws when the cms token is missing', () => {
    expect(() => deriveStage(state({ cms: undefined }))).toThrow(/not found/);
  });

  it('is not-started with no previous token', () => {
    expect(deriveStage(state({}))).toBe('not-started');
  });

  it('is not-started while previous only mirrors active', () => {
    expect(deriveStage(state({ previous: 'old' }))).toBe('not-started');
  });

  it('is staged while the cms still holds the previous token', () => {
    expect(deriveStage(state({ active: 'new', previous: 'old' }))).toBe(
      'staged'
    );
  });

  it('is switched once the cms holds the active token', () => {
    expect(
      deriveStage(state({ active: 'new', previous: 'old', cms: 'new' }))
    ).toBe('switched');
  });

  it('refuses a cms token that differs with nothing staged', () => {
    expect(() => deriveStage(state({ cms: 'other' }))).toThrow(/differs/);
  });

  it('refuses a cms token matching neither builder token', () => {
    expect(() =>
      deriveStage(state({ active: 'new', previous: 'old', cms: 'other' }))
    ).toThrow(/neither/);
  });
});

describe('classifyApps', () => {
  const names = [
    'cdwr-builder',
    'cdwr-builder-pr-12',
    'cdwr-cms',
    'cdwr-cms-acme',
    'cdwr-cms-pr-12',
    'cdwr-cms-pr-12-acme',
    'cdwr-cmsx',
    'cdwr-web-production'
  ];

  it('picks the production builder and every production cms app', () => {
    expect(
      classifyApps(names, 'cdwr-builder', 'cdwr-cms', 'production')
    ).toEqual({
      builders: ['cdwr-builder'],
      cms: ['cdwr-cms', 'cdwr-cms-acme']
    });
  });

  it('picks every pull request app for preview', () => {
    expect(classifyApps(names, 'cdwr-builder', 'cdwr-cms', 'preview')).toEqual({
      builders: ['cdwr-builder-pr-12'],
      cms: ['cdwr-cms-pr-12', 'cdwr-cms-pr-12-acme']
    });
  });
});

describe('remainingSteps', () => {
  it('lists all three steps from the start', () => {
    const steps = remainingSteps('not-started');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatch(/^Step 1/);
    expect(steps[2]).toMatch(/^Step 3/);
  });

  it('re-restarts the builder, then runs steps 2 and 3, from staged', () => {
    const steps = remainingSteps('staged');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatch(/Restart the builder/);
    expect(steps[1]).toMatch(/^Step 2/);
  });

  it('re-restarts the cms, then runs step 3, from switched', () => {
    const steps = remainingSteps('switched');
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatch(/Restart every cms app/);
    expect(steps[1]).toMatch(/^Step 3/);
  });
});
