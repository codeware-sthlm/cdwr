import type { TenantApp } from '../../services/infisical';

import {
  apiKeyMismatch,
  isPreWriteFailure,
  parseRotationOutput,
  summarizeTenantKeys,
  tenantFlyApps
} from './rotate-key.logic';

describe('summarizeTenantKeys', () => {
  it('only counts apps holding a PAYLOAD_API_KEY', () => {
    const apps: TenantApp[] = [
      { app: 'cms', secrets: { PAYLOAD_API_KEY: 'key-1' } },
      { app: 'web', secrets: {} }
    ];
    expect(summarizeTenantKeys(apps)).toEqual({
      apps: ['cms'],
      apiKeys: ['key-1']
    });
  });

  it('collects every distinct key value', () => {
    const apps: TenantApp[] = [
      { app: 'cms', secrets: { PAYLOAD_API_KEY: 'key-1' } },
      { app: 'web', secrets: { PAYLOAD_API_KEY: 'key-2' } }
    ];
    expect(summarizeTenantKeys(apps).apiKeys).toEqual(['key-1', 'key-2']);
  });

  it('dedupes a key shared by every app', () => {
    const apps: TenantApp[] = [
      { app: 'cms', secrets: { PAYLOAD_API_KEY: 'key-1' } },
      { app: 'web', secrets: { PAYLOAD_API_KEY: 'key-1' } }
    ];
    expect(summarizeTenantKeys(apps).apiKeys).toEqual(['key-1']);
  });

  it('is empty when nothing holds a key', () => {
    expect(summarizeTenantKeys([{ app: 'cms', secrets: {} }])).toEqual({
      apps: [],
      apiKeys: []
    });
  });
});

describe('apiKeyMismatch', () => {
  it('is false for zero or one key', () => {
    expect(apiKeyMismatch([])).toBe(false);
    expect(apiKeyMismatch(['a'])).toBe(false);
  });

  it('is true for more than one distinct key', () => {
    expect(apiKeyMismatch(['a', 'b'])).toBe(true);
  });
});

describe('isPreWriteFailure', () => {
  it('is true for a connection failure with neither marker', () => {
    expect(isPreWriteFailure('the script exited early')).toBe(true);
    expect(isPreWriteFailure('did not report a result')).toBe(true);
  });

  it('is false once the tenant was resolved', () => {
    expect(isPreWriteFailure('RESOLVED_TENANT=acme\nexited early')).toBe(false);
  });

  it('is false once the key was rotated', () => {
    expect(isPreWriteFailure('ROTATED_API_KEY=xyz\nexited early')).toBe(false);
  });

  it('is false for an unrelated error', () => {
    expect(isPreWriteFailure('permission denied')).toBe(false);
  });
});

describe('parseRotationOutput', () => {
  it('reads both markers', () => {
    expect(
      parseRotationOutput('RESOLVED_TENANT=acme\nROTATED_API_KEY=xyz\n')
    ).toEqual({ apiKey: 'xyz', slug: 'acme' });
  });

  it('defaults the key to empty and the slug to undefined when absent', () => {
    expect(parseRotationOutput('nothing here')).toEqual({
      apiKey: '',
      slug: undefined
    });
  });
});

describe('tenantFlyApps', () => {
  it('names each app through the injected namer', () => {
    const namer = vi.fn((app: string) => `cdwr-${app}-demo`);
    expect(tenantFlyApps(['cms', 'web'], namer)).toEqual([
      { app: 'cms', flyApp: 'cdwr-cms-demo' },
      { app: 'web', flyApp: 'cdwr-web-demo' }
    ]);
    expect(namer).toHaveBeenCalledTimes(2);
  });
});
