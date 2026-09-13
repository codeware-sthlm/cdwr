import { readFileSync } from 'fs';
import { resolve } from 'path';

import { FLY_CONFIG_APP_NAMES, TENANT_APPS } from './tenant-apps';

describe('FLY_CONFIG_APP_NAMES', () => {
  it.each(TENANT_APPS)('matches the app name in apps/%s/fly.toml', (app) => {
    const config = readFileSync(
      resolve(__dirname, '../../..', app, 'fly.toml'),
      'utf8'
    );
    const [, name] = /^app\s*=\s*['"]([^'"]+)['"]/m.exec(config) ?? [];

    expect(FLY_CONFIG_APP_NAMES[app]).toBe(name);
  });
});
