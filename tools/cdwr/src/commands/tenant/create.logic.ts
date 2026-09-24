/**
 * Reading what the creation script reported, and checking what is typed at it.
 *
 * The shape is restated here rather than imported from the cms app: importing
 * it would pull Payload into the CLI, which is what running the work in a
 * subprocess avoids.
 */

export type CreatedTenant = {
  id: number;
  name: string;
  slug: string;
  supportedLocales: Array<string>;
  deployment: string | null;
  apiKey: string | null;
  dryRun: boolean;
};

/** Reads the result the script printed, or says the run produced none. */
export function parseCreatedTenant(stdout: string): CreatedTenant {
  const line = stdout.match(/^CREATED_TENANT=(.+)$/m)?.[1];

  if (!line) {
    throw new Error('The creation script reported no result');
  }

  const tenant = JSON.parse(line) as CreatedTenant;

  if (!tenant?.slug || typeof tenant.id !== 'number') {
    throw new Error('The creation script reported something unreadable');
  }

  return tenant;
}

/**
 * What a deployment name has to look like, checked before anything runs.
 *
 * It ends up in Fly app names and in an Infisical path, and it cannot be
 * changed once saved — so a bad one is worth catching at the prompt rather
 * than as a validation error after the database has been reached.
 */
export function deploymentNameProblem(name: string): string | undefined {
  if (!/^[a-z0-9-]+$/.test(name)) {
    return 'Use lowercase letters, digits and hyphens only';
  }
  if (name.startsWith('-') || name.endsWith('-')) {
    return 'It cannot start or end with a hyphen';
  }
  return undefined;
}

/** The steps a creation plan shows, in the order they happen. */
export function createSteps(input: {
  name: string;
  slug?: string;
  locales: Array<string>;
  deployment?: string;
}): Array<string> {
  const { name, slug, locales, deployment } = input;

  return [
    `Create the workspace '${name}'${slug ? ` with the slug '${slug}'` : ''}`,
    `Support ${locales.join(', ')}`,
    'Generate its API key',
    ...(deployment ? [`Record '${deployment}' as its deployment name`] : [])
  ];
}
