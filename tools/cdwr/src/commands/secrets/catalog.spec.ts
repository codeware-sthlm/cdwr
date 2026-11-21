import { ENTRIES } from '../index';

import {
  CATALOG,
  type ProjectName,
  type SecretEnvironment,
  environmentsOf,
  findEntry,
  pathMatches
} from './catalog';

const envsOf = (entry: (typeof CATALOG)[number]) =>
  entry.environments ?? environmentsOf(entry.project);

describe('CATALOG', () => {
  it('points every rotation command at a registered command', () => {
    const paths = ENTRIES.map((e) => e.path.join(' '));
    for (const entry of CATALOG) {
      if (entry.kind === 'setting' || !('command' in entry.rotation)) continue;
      expect(paths, `${entry.key}`).toContain(entry.rotation.command.join(' '));
    }
  });

  it('has no overlapping entries', () => {
    CATALOG.forEach((a, i) => {
      CATALOG.slice(i + 1).forEach((b) => {
        const overlaps =
          a.project === b.project &&
          a.key === b.key &&
          (pathMatches(a.path, b.path) || pathMatches(b.path, a.path)) &&
          envsOf(a).some((env) => envsOf(b).includes(env));
        expect(overlaps, `${a.path} ${a.key} vs ${b.path} ${b.key}`).toBe(
          false
        );
      });
    });
  });

  it('limits environments to those of the project', () => {
    for (const entry of CATALOG) {
      for (const env of entry.environments ?? []) {
        expect(environmentsOf(entry.project)).toContain(env);
      }
    }
  });
});

describe('pathMatches', () => {
  it('lets <tenant> match one folder segment', () => {
    expect(
      pathMatches('/tenants/<tenant>/apps/cms', '/tenants/acme/apps/cms')
    ).toBe(true);
    expect(
      pathMatches('/tenants/<tenant>/apps/cms', '/tenants/acme/apps/cms/x')
    ).toBe(false);
    expect(
      pathMatches('/tenants/<tenant>/apps/cms', '/tenants//apps/cms')
    ).toBe(false);
    expect(pathMatches('/tenants/<tenant>', '/tenants/acme')).toBe(true);
  });

  it('matches an exact path only to itself', () => {
    expect(pathMatches('/apps/cms', '/apps/cms')).toBe(true);
    expect(pathMatches('/apps/cms', '/apps/headless')).toBe(false);
    expect(pathMatches('/apps/cms', '/apps/cms/signature')).toBe(false);
  });
});

describe('findEntry', () => {
  it('respects environments', () => {
    expect(
      findEntry('codeware', 'preview', '/apps/cms', 'SMTP_HOST')
    ).toBeDefined();
    expect(
      findEntry('codeware', 'production', '/apps/cms', 'SMTP_HOST')
    ).toBeUndefined();
  });

  const samples: [ProjectName, SecretEnvironment, string, string][] = [
    ['codeware', 'production', '/apps/cms', 'PAYLOAD_SECRET_KEY'],
    ['codeware', 'preview', '/apps/cms', 'PAYLOAD_SECRET_KEY'],
    ['codeware', 'production', '/tenants/acme/apps/cms', 'PAYLOAD_API_KEY'],
    ['codeware', 'preview', '/tenants/acme/apps/headless', 'PAYLOAD_API_KEY'],
    ['codeware', 'production', '/tenants/acme', 'TURNSTILE_SITE_KEY'],
    ['codeware', 'preview', '/apps/cms', 'SMTP_PASSWORD'],
    ['codeware', 'production', '/apps/cms/signature', 'SIGNATURE_SECRET'],
    ['codeware', 'production', '/integrations/fly', 'API_TOKEN'],
    ['agent-host', 'production', '/agent-queue', 'FLY_API_TOKEN'],
    ['agent-host', 'production', '/agent-queue', 'DESK_FLY_TOKEN']
  ];

  it.each(samples)('knows %s %s %s %s', (project, env, path, key) => {
    expect(findEntry(project, env, path, key)).toBeDefined();
  });
});
