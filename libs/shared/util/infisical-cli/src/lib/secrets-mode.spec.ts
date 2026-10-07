import { deployEnvironment, isSet, secretsMode } from './secrets-mode';

describe('isSet', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['FALSE', false],
    ['0', false],
    ['1', true],
    ['true', true],
    ['yes', true]
  ])('%j -> %s', (value, expected) => {
    expect(isSet(value)).toBe(expected);
  });
});

describe('secretsMode', () => {
  it.each([
    [{}, 'online'],
    [{ CI: 'true' }, 'ci'],
    [{ OFFLINE: '1' }, 'offline'],
    [{ CI: 'true', OFFLINE: '1' }, 'ci'],
    [{ CI: 'false', OFFLINE: '1' }, 'offline'],
    [{ CI: '0', OFFLINE: '' }, 'online']
  ])('%j -> %s', (env, expected) => {
    expect(secretsMode(env)).toBe(expected);
  });
});

describe('deployEnvironment', () => {
  it.each([
    [{}, 'development'],
    [{ DEPLOY_ENV: '' }, 'development'],
    [{ DEPLOY_ENV: 'production' }, 'production']
  ])('%j -> %s', (env, expected) => {
    expect(deployEnvironment(env)).toBe(expected);
  });
});
