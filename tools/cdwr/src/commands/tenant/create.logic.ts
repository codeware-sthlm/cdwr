import {
  MAX_DEPLOYMENT_NAME_LENGTH,
  deploymentNameIssue
} from '@codeware/shared/util/pure';

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
 * Why a deployment name cannot be used, in words — or nothing when it can.
 *
 * The rule itself is the platform's (`deploymentNameIssue`), because the name
 * ends up in Fly app names and an Infisical path and cannot be changed once
 * saved. Catching it at the prompt beats a validation error after the
 * database has been reached.
 */
export function deploymentNameProblem(name: string): string | undefined {
  switch (deploymentNameIssue(name)) {
    case null:
      return undefined;
    case 'empty':
      return 'It cannot be empty';
    case 'characters':
      return 'Use lowercase letters, digits and hyphens only';
    case 'hyphens':
      return 'It cannot start or end with a hyphen, or contain two in a row';
    case 'reserved':
      return 'That name is one the deploy builds for itself';
    case 'too-long':
      return `At most ${MAX_DEPLOYMENT_NAME_LENGTH} characters`;
  }
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
