import { type Credentials, createClient } from './create-client';
import { type Environment } from './infisical.schemas';
import { listInfisicalSecretImports } from './list-infisical-secret-imports';

type Options<TEnv> = Credentials & {
  /**
   * The environment of the folder, and of the folder it imports from.
   */
  environment: TEnv;

  /**
   * Full path of the folder that gets the import, such as `/tenants/moon/apps/headless`.
   */
  path: string;

  /**
   * Full path of the folder to import, such as `/apps/headless`.
   */
  importPath: string;
};

/**
 * Make a folder import another folder from the same Infisical environment.
 *
 * The SDK has no secret imports, so this calls the REST API directly. An import
 * is a reference: the importing folder reads the other folder's secrets, as
 * `listSecretsWithImports` does, and does not hold a copy.
 *
 * Idempotent: an import that is already there is left as it is.
 *
 * @returns `true` when the import was created, `false` when it was there
 * @throws An error if the credentials are invalid or the import is refused
 */
export const ensureInfisicalSecretImport = async <TEnv = Environment>({
  environment,
  path,
  importPath,
  ...credentials
}: Options<TEnv>): Promise<boolean> => {
  const { client, projectId, siteUrl } = await createClient(credentials);
  const env = String(environment);

  const imports = await listInfisicalSecretImports({
    environment,
    path,
    ...credentials
  });
  if (
    imports.some(
      (existing) =>
        existing.path === importPath && existing.environment === env
    )
  ) {
    return false;
  }

  const token = client.auth().getAccessToken();
  if (!token) {
    throw new Error('Infisical did not return an access token');
  }

  const response = await fetch(`${siteUrl}/api/v2/secret-imports`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      projectId,
      environment: env,
      path,
      import: { environment: env, path: importPath }
    })
  });

  if (response.ok) {
    return true;
  }

  throw new Error(
    `Infisical refused to import ${importPath} into ${path} [StatusCode=${response.status}]`
  );
};
