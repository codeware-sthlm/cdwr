import { z } from 'zod';

import { type Credentials, createClient } from './create-client';
import { type Environment } from './infisical.schemas';

type Options<TEnv> = Credentials & {
  /**
   * The environment of the folder.
   */
  environment: TEnv;

  /**
   * Full path of the folder, such as `/tenants/moon/apps/headless`.
   */
  path: string;
};

const ResponseSchema = z.object({
  secretImports: z.array(
    z.object({
      importPath: z.string(),
      importEnv: z.object({ slug: z.string() })
    })
  )
});

/**
 * List what one folder imports, as the source folder and its environment.
 *
 * The SDK has no secret imports, so this calls the REST API directly. A folder
 * that is not there imports nothing.
 *
 * @returns The imports of the folder, an empty list when there is no folder
 * @throws An error if the credentials are invalid or the list is refused
 */
export const listInfisicalSecretImports = async <TEnv = Environment>({
  environment,
  path,
  ...credentials
}: Options<TEnv>): Promise<Array<{ path: string; environment: string }>> => {
  const { client, projectId, siteUrl } = await createClient(credentials);

  const token = client.auth().getAccessToken();
  if (!token) {
    throw new Error('Infisical did not return an access token');
  }

  const query = new URLSearchParams({
    projectId,
    environment: String(environment),
    path
  });
  const response = await fetch(`${siteUrl}/api/v2/secret-imports?${query}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` }
  });

  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(
      `Infisical refused to list imports of ${path} [StatusCode=${response.status}]`
    );
  }

  const { secretImports } = ResponseSchema.parse(await response.json());
  return secretImports.map(({ importPath, importEnv }) => ({
    path: importPath,
    environment: importEnv.slug
  }));
};
