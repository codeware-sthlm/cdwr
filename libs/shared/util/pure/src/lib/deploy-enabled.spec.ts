import { describe, expect, it } from 'vitest';

import { DEPLOY_ENABLED_KEY, isDeployEnabled } from './deploy-enabled';

describe('DEPLOY_ENABLED_KEY', () => {
  it('names the secret', () => {
    expect(DEPLOY_ENABLED_KEY).toBe('DEPLOY_ENABLED');
  });
});

describe('isDeployEnabled', () => {
  it.each([
    ['true', true],
    ['TRUE', true],
    ['True', true],
    [' true ', true],
    ['\ttrue\n', true],
    ['false', false],
    ['FALSE', false],
    ['', false],
    ['   ', false],
    ['1', false],
    ['yes', false],
    ['on', false],
    ['truee', false],
    [undefined, false],
    [null, false]
  ])('%j -> %s', (value, expected) => {
    expect(isDeployEnabled(value)).toBe(expected);
  });
});
