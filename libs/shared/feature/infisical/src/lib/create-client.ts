import { InfisicalSDK } from '@infisical/sdk';

import { type Client, ClientSchema } from './infisical.schemas';

export type Credentials = {
  /**
   * Infisical client ID for authentication.
   *
   * Takes precedence over `INFISICAL_CLIENT_ID` environment variable when provided.
   */
  clientId?: string;

  /**
   * Infisical client secret for authentication.
   *
   * Takes precedence over `INFISICAL_CLIENT_SECRET` environment variable when provided.
   */
  clientSecret?: string;

  /**
   * Infisical project ID.
   *
   * Takes precedence over `INFISICAL_PROJECT_ID` environment variable when provided.
   */
  projectId?: string;

  /**
   * The site to use for the Infisical client.
   *
   * Takes precedence over `INFISICAL_SITE` environment variable when provided.
   *
   * Defaults to `'us'`.
   */
  site?: 'eu' | 'us';
};

/**
 * Resolve credentials and return an authenticated Infisical client.
 *
 * Options take precedence over the `INFISICAL_*` environment variables.
 *
 * @throws An error if the credentials are invalid or authentication fails
 */
export const createClient = async ({
  clientId,
  clientSecret,
  projectId,
  site
}: Credentials): Promise<{
  client: InfisicalSDK;
  projectId: string;
  siteUrl: string;
}> => {
  const optionsWithEnv: Client = {
    INFISICAL_CLIENT_ID: clientId || process.env['INFISICAL_CLIENT_ID'] || '',
    INFISICAL_CLIENT_SECRET:
      clientSecret || process.env['INFISICAL_CLIENT_SECRET'] || '',
    INFISICAL_PROJECT_ID:
      projectId || process.env['INFISICAL_PROJECT_ID'] || '',
    INFISICAL_SERVICE_TOKEN: process.env['INFISICAL_SERVICE_TOKEN'],
    INFISICAL_SITE:
      site || (process.env['INFISICAL_SITE'] as Client['INFISICAL_SITE'])
  };

  const { success, data, error } = ClientSchema.safeParse(optionsWithEnv);

  if (!success) {
    throw new Error('Could not resolve Infisical credentials', {
      cause: error.flatten().fieldErrors
    });
  }

  const client = new InfisicalSDK({
    siteUrl:
      data.INFISICAL_SITE === 'eu' ? 'https://eu.infisical.com' : undefined
  });
  const siteUrl =
    data.INFISICAL_SITE === 'eu'
      ? 'https://eu.infisical.com'
      : 'https://app.infisical.com';

  if ('INFISICAL_SERVICE_TOKEN' in data) {
    client.auth().accessToken(data.INFISICAL_SERVICE_TOKEN);
  } else {
    await client.auth().universalAuth.login({
      clientId: data.INFISICAL_CLIENT_ID,
      clientSecret: data.INFISICAL_CLIENT_SECRET
    });
  }

  return { client, projectId: data.INFISICAL_PROJECT_ID, siteUrl };
};
