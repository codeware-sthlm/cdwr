import { type Credentials, createClient } from './create-client';
import { type Environment } from './infisical.schemas';

type Options<TEnv> = Credentials & {
  environment: TEnv;

  /** Full path of the folder, such as `/apps/cms` */
  path: string;
};

/**
 * The secrets a folder holds itself: references are not expanded, nothing is
 * imported and nothing comes from subfolders.
 *
 * @throws An error if the credentials are invalid or the read fails
 */
export const readOwnInfisicalSecrets = async <TEnv = Environment>({
  environment,
  path,
  ...credentials
}: Options<TEnv>): Promise<
  Array<{ secretKey: string; secretValue: string }>
> => {
  const { client, projectId } = await createClient(credentials);
  const { secrets } = await client.secrets().listSecrets({
    projectId,
    environment: String(environment),
    secretPath: path,
    recursive: false,
    includeImports: false,
    expandSecretReferences: false,
    viewSecretValue: true
  });
  return secrets.map(({ secretKey, secretValue }) => ({
    secretKey,
    secretValue
  }));
};
