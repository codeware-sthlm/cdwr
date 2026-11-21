import { readFileSync } from 'fs';
import { join, resolve } from 'path';

import { dropStaleClientConfigs } from './client-config-cache';

type Cache = Record<string, { serverURL?: string } | undefined>;

const globalCache = globalThis as { _payload_clientConfigs?: Cache };

describe('dropStaleClientConfigs', () => {
  afterEach(() => {
    delete globalCache._payload_clientConfigs;
  });

  it('does nothing before Payload has cached anything', () => {
    expect(dropStaleClientConfigs('https://cms.example')).toEqual([]);
  });

  it('drops the languages built with another serverURL', () => {
    globalCache._payload_clientConfigs = {
      en: { serverURL: 'https://cms.example' },
      sv: { serverURL: 'https://cdwr-cms.fly.dev' }
    };

    expect(dropStaleClientConfigs('https://cms.example')).toEqual(['sv']);
    expect(globalCache._payload_clientConfigs).toEqual({
      en: { serverURL: 'https://cms.example' }
    });
  });

  it('deletes in place, so a reference held elsewhere sees it', () => {
    const held: Cache = {
      sv: { serverURL: 'https://cdwr-cms.fly.dev' }
    };
    globalCache._payload_clientConfigs = held;

    dropStaleClientConfigs('https://cms.example');

    expect(globalCache._payload_clientConfigs).toBe(held);
    expect(held).toEqual({});
  });

  it('keeps every entry when nothing is stale', () => {
    globalCache._payload_clientConfigs = {
      en: { serverURL: 'https://cms.example' },
      sv: { serverURL: 'https://cms.example' }
    };

    expect(dropStaleClientConfigs('https://cms.example')).toEqual([]);
    expect(Object.keys(globalCache._payload_clientConfigs)).toEqual([
      'en',
      'sv'
    ]);
  });
});

/**
 * `dropStaleClientConfigs` rests on how the installed `getClientConfig` keeps
 * its cache: one entry per language on `global._payload_clientConfigs`, read
 * through a reference taken when the module loads, with `serverURL` copied
 * from the config as it is when the entry is built. None of that is a
 * documented promise, so it is pinned to Payload's own source. A failure here
 * means the cache moved, and the stale-entry check needs another way in.
 */

// Read off disk rather than resolved: these are internals the exports maps
// don't expose, and it is the shipped source this needs to look at
const nodeModules = join(resolve(__dirname, '../../../..'), 'node_modules');

const source = (file: string) => readFileSync(join(nodeModules, file), 'utf8');

describe('payload caches the client config per language', () => {
  const getClientConfig = source(
    '@payloadcms/ui/dist/utilities/getClientConfig.js'
  );

  it('keeps the cache on the global, read through a module reference', () => {
    expect(getClientConfig).toContain(
      'let cachedClientConfigs = global._payload_clientConfigs'
    );
  });

  it('keys the cache by language', () => {
    expect(getClientConfig).toContain('const currentLanguage = i18n.language');
    expect(getClientConfig).toContain(
      'cachedClientConfigs[currentLanguage] = cachedClientConfig'
    );
  });

  it('copies serverURL into the client config as it is at build time', () => {
    // `serverURL` is not a server-only key, so the default branch copies it
    const client = source('payload/dist/config/client.js');
    expect(client).toContain('clientConfig[key] = config[key]');
    expect(client).toContain('serverURL: clientConfig.serverURL');
  });
});
