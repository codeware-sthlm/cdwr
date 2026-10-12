import { type Credentials, createClient } from './create-client';
import { type Environment } from './infisical.schemas';
import { splitFolderPath } from './split-folder-path';

type Options<TEnv> = Credentials & {
  /**
   * The environment to delete the folder from.
   *
   * Required: a destructive call never falls back to a default environment.
   */
  environment: TEnv;

  /**
   * Full path of the folder to delete, such as `/tenants/moon`.
   */
  path: string;
};

/**
 * Delete a folder, with everything in it, from one Infisical environment.
 *
 * The SDK has no folder delete, so this calls the REST API directly. The
 * Infisical UI deletes a folder in every environment; this one is scoped to
 * the environment given.
 *
 * Same contract as `deleteInfisicalSecret`: a folder that is not there is not
 * an error, everything else throws.
 *
 * @returns `true` when a folder was deleted, `false` when there was none
 * @throws An error if the credentials are invalid or the delete fails
 */
export const deleteInfisicalFolder = async <TEnv = Environment>({
  environment,
  path,
  ...credentials
}: Options<TEnv>): Promise<boolean> => {
  const { client, projectId, siteUrl } = await createClient(credentials);
  const { parent, name } = splitFolderPath(path);

  const token = client.auth().getAccessToken();
  if (!token) {
    throw new Error('Infisical did not return an access token');
  }

  const response = await fetch(
    `${siteUrl}/api/v2/folders/${encodeURIComponent(name)}`,
    {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        projectId,
        environment: String(environment),
        path: parent,
        forceDelete: true
      })
    }
  );

  if (response.ok) {
    return true;
  }
  if (response.status === 404) {
    return false;
  }

  throw new Error(
    `Infisical refused to delete folder ${path} [StatusCode=${response.status}]`
  );
};
