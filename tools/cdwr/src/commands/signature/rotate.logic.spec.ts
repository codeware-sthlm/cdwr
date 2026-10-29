import {
  ACTIVE,
  PREVIOUS,
  classifyApps,
  deriveStage,
  generateSecret,
  remainingSteps
} from './rotate.logic';

describe('deriveStage', () => {
  it('throws when the active secret is missing', () => {
    expect(() => deriveStage(undefined, undefined)).toThrow(/not found/);
  });

  it('is not-started with no previous secret', () => {
    expect(deriveStage('abc', undefined)).toBe('not-started');
  });

  it('is previous-staged when previous mirrors active', () => {
    expect(deriveStage('abc', 'abc')).toBe('previous-staged');
  });

  it('is rolling-over once active has moved on', () => {
    expect(deriveStage('new', 'abc')).toBe('rolling-over');
  });
});

describe('generateSecret', () => {
  it('is 64 hex characters', () => {
    expect(generateSecret()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs between calls', () => {
    expect(generateSecret()).not.toBe(generateSecret());
  });
});

describe('classifyApps', () => {
  const names = [
    'cdwr-cms',
    'cdwr-cms-pr-12',
    'cdwr-cms-acme',
    'cdwr-web-production',
    'cdwr-web-pr-12-acme',
    'cdwr-headless-acme',
    'cdwr-headless-pr-12-acme'
  ];
  const signers = ['cdwr-headless', 'cdwr-web'];

  it('picks the bare host app and signer apps for production', () => {
    const result = classifyApps(names, 'cdwr-cms', signers, 'production');
    expect(result.verifiers).toEqual(['cdwr-cms']);
    expect(result.signers).toEqual([
      'cdwr-headless-acme',
      'cdwr-web-production'
    ]);
  });

  it('picks the pull request host app and signer apps for preview', () => {
    const result = classifyApps(names, 'cdwr-cms', signers, 'preview');
    expect(result.verifiers).toEqual(['cdwr-cms-pr-12']);
    expect(result.signers).toEqual([
      'cdwr-headless-pr-12-acme',
      'cdwr-web-pr-12-acme'
    ]);
  });

  it('treats development like production, matching the bare app names', () => {
    const result = classifyApps(names, 'cdwr-cms', signers, 'development');
    expect(result.verifiers).toEqual(['cdwr-cms']);
    expect(result.signers).toEqual([
      'cdwr-headless-acme',
      'cdwr-web-production'
    ]);
  });
});

describe('remainingSteps', () => {
  it('lists every step from not-started', () => {
    expect(remainingSteps('not-started')).toEqual([
      `Stage the current secret as ${PREVIOUS}, restart cms`,
      `Generate a new ${ACTIVE}, restart cms then the signers`,
      `Retire ${PREVIOUS}, restart cms`
    ]);
  });

  it('skips staging once previous-staged', () => {
    expect(remainingSteps('previous-staged')).toEqual([
      `Generate a new ${ACTIVE}, restart cms then the signers`,
      `Retire ${PREVIOUS}, restart cms`
    ]);
  });

  it('is only the retirement once rolling-over', () => {
    expect(remainingSteps('rolling-over')).toEqual([
      `Retire ${PREVIOUS}, restart cms`
    ]);
  });
});
