import {
  createSteps,
  deploymentNameProblem,
  parseCreatedTenant
} from './create.logic';

const reported = (tenant: Record<string, unknown>) =>
  `[CREATE] done\nCREATED_TENANT=${JSON.stringify(tenant)}\n`;

const tenant = {
  id: 7,
  name: 'cdwr.io',
  slug: 'cdwr-io',
  supportedLocales: ['en'],
  deployment: null,
  apiKey: 'a-key',
  dryRun: true
};

describe('parseCreatedTenant', () => {
  it('reads the result off the marker line', () => {
    expect(parseCreatedTenant(reported(tenant))).toEqual(tenant);
  });

  it('refuses output with no marker at all', () => {
    // The script exits 0 on success, so silence has to be an error here or a
    // failed creation reads as a successful one
    expect(() => parseCreatedTenant('[CREATE] nothing\n')).toThrow(
      'reported no result'
    );
  });

  it('refuses a result missing the fields the caller needs', () => {
    expect(() => parseCreatedTenant(reported({ name: 'cdwr.io' }))).toThrow(
      'unreadable'
    );
  });
});

describe('deploymentNameProblem', () => {
  it.each(['cdwr-io', 'demo', 'a1'])('accepts %s', (name) => {
    expect(deploymentNameProblem(name)).toBeUndefined();
  });

  it.each(['Cdwr', 'cdwr_io', 'cdwr io', 'cdwr.io'])('rejects %s', (name) => {
    expect(deploymentNameProblem(name)).toBe(
      'Use lowercase letters, digits and hyphens only'
    );
  });

  it.each(['-demo', 'demo-'])('rejects %s for its hyphen', (name) => {
    expect(deploymentNameProblem(name)).toBe(
      'It cannot start or end with a hyphen'
    );
  });
});

describe('createSteps', () => {
  it('leaves the slug out when it is derived from the name', () => {
    expect(createSteps({ name: 'cdwr.io', locales: ['en'] })).toEqual([
      "Create the workspace 'cdwr.io'",
      'Support en',
      'Generate its API key'
    ]);
  });

  it('names the deployment only when there is one', () => {
    const steps = createSteps({
      name: 'cdwr.io',
      slug: 'cdwr-io',
      locales: ['en', 'sv'],
      deployment: 'cdwr-io'
    });

    expect(steps).toEqual([
      "Create the workspace 'cdwr.io' with the slug 'cdwr-io'",
      'Support en, sv',
      'Generate its API key',
      "Record 'cdwr-io' as its deployment name"
    ]);
  });
});
