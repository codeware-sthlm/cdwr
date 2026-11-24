import { readFileSync } from 'fs';
import { resolve } from 'path';

import * as TOML from 'smol-toml';

import { FLY_CONFIG_APP_NAMES, TENANT_APPS } from './tenant-apps';

const readConfig = (app: string, file: string) =>
  readFileSync(resolve(__dirname, '../../..', app, file), 'utf8');

describe('FLY_CONFIG_APP_NAMES', () => {
  it.each(TENANT_APPS)('matches the app name in apps/%s/fly.toml', (app) => {
    const config = readConfig(app, 'fly.toml');
    const [, name] = /^app\s*=\s*['"]([^'"]+)['"]/m.exec(config) ?? [];

    expect(FLY_CONFIG_APP_NAMES[app]).toBe(name);
  });
});

describe('fly.toml and fly.production.toml', () => {
  // Preview scales to zero, production keeps one machine: the only difference
  const parse = (app: string, file: string) => {
    const config = TOML.parse(readConfig(app, file));
    const service = config['http_service'];
    if (service && typeof service === 'object' && !Array.isArray(service)) {
      delete service['min_machines_running'];
    }
    return config;
  };

  it.each(TENANT_APPS)(
    'apps/%s differ only in http_service.min_machines_running',
    (app) => {
      expect(parse(app, 'fly.toml')).toEqual(parse(app, 'fly.production.toml'));
    }
  );
});
