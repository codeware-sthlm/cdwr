import { describe, expect, it } from 'vitest';

import {
  matchesDeployRule,
  parseDeployRule,
  readDeployRules
} from './deploy-rules';

const secret = (
  secretValue: string,
  secretMetadata: Array<{ key: string; value: string }> = []
) => ({ secretValue, secretMetadata });

describe('readDeployRules', () => {
  it('reads both rules from metadata', () => {
    expect(
      readDeployRules(
        secret('ignored', [
          { key: 'apps', value: '*' },
          { key: 'tenants', value: '_default,demo' }
        ])
      )
    ).toEqual({
      rules: { apps: '*', tenants: '_default,demo' },
      source: 'metadata'
    });
  });

  it('falls back to the JSON value when metadata lacks a rule', () => {
    expect(
      readDeployRules(
        secret(JSON.stringify({ apps: 'cms', tenants: '*' }), [
          { key: 'apps', value: 'web' }
        ])
      )
    ).toEqual({ rules: { apps: 'cms', tenants: '*' }, source: 'value' });
  });

  it.each([
    [
      'empty metadata values',
      secret('', [
        { key: 'apps', value: ' ' },
        { key: 'tenants', value: 'demo' }
      ])
    ],
    ['a value that is not JSON', secret('not-json')],
    ['JSON without tenants', secret(JSON.stringify({ apps: '*' }))],
    [
      'JSON with the wrong types',
      secret(JSON.stringify({ apps: 1, tenants: true }))
    ],
    ['JSON null', secret('null')]
  ])('refuses %s', (_label, input) => {
    expect(() => readDeployRules(input)).toThrow(
      'DEPLOY_RULES format is invalid'
    );
  });
});

describe('parseDeployRule and matchesDeployRule', () => {
  it('treats * as every value', () => {
    const rule = parseDeployRule(' * ');

    expect(rule).toBeNull();
    expect(matchesDeployRule('ks-vininfo', rule)).toBe(true);
  });

  it('matches only listed values', () => {
    const rule = parseDeployRule('_default, demo,');

    expect(rule).toEqual(['_default', 'demo']);
    expect(matchesDeployRule('demo', rule)).toBe(true);
    expect(matchesDeployRule('ks-vininfo', rule)).toBe(false);
  });
});
