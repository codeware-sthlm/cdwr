import { describe, expect, it } from 'vitest';

import {
  DEPLOY_ENABLED_KEY,
  isDeployEnabled,
  ownDeployFlag
} from './deploy-enabled';

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

describe('ownDeployFlag', () => {
  const flag = (secretValue: string, secretPath?: string) => ({
    secretKey: 'DEPLOY_ENABLED',
    secretValue,
    secretPath
  });

  it('returns the value when the secret path is absent', () => {
    expect(ownDeployFlag([flag('true')], '/apps/cms')).toBe('true');
  });

  it('returns the value of a secret in the folder, ignoring trailing slashes', () => {
    expect(ownDeployFlag([flag('true', '/apps/cms/')], '/apps/cms')).toBe(
      'true'
    );
    expect(ownDeployFlag([flag('false', '/apps/cms')], '/apps/cms/')).toBe(
      'false'
    );
  });

  it('ignores a flag reached through an import or a subfolder', () => {
    expect(
      ownDeployFlag([flag('true', '/shared')], '/apps/cms')
    ).toBeUndefined();
    expect(
      ownDeployFlag([flag('true', '/apps/cms/sub')], '/apps/cms')
    ).toBeUndefined();
  });

  it('prefers the own flag over an imported one', () => {
    expect(
      ownDeployFlag(
        [flag('true', '/shared'), flag('false', '/apps/cms')],
        '/apps/cms'
      )
    ).toBe('false');
  });

  it('returns undefined without a flag', () => {
    expect(
      ownDeployFlag([{ secretKey: 'A', secretValue: '1' }], '/apps/cms')
    ).toBeUndefined();
  });
});
