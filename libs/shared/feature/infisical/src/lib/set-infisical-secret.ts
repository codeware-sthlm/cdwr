import { type Credentials, createClient } from './create-client';
import { isNotFound } from './error-status';
import { type Environment } from './infisical.schemas';

type Options<TEnv> = Credentials & {
  /**
   * The environment to write the secret to.
   *
   * Defaults to `'development'`.
   */
  environment?: TEnv;

  /**
   * Folder-based path to the secret.
   *
   * Defaults to the root folder.
   */
  path?: string;

  /**
   * Name of the secret to write.
   */
  key: string;

  /**
   * Value to write.
   */
  value: string;

  /**
   * Only create the secret, never update one.
   *
   * An existing secret makes Infisical's "already exists" error through.
   */
  createOnly?: boolean;
};

export type SetSecretResult = {
  /** Whether the secret was created or an existing one was updated */
  action: 'created' | 'updated';
  key: string;
  path: string;
};

/**
 * Write a single secret to Infisical, creating it when it does not exist.
 *
 * Counterpart to `withInfisical`, which only reads. Credentials resolve the same
 * way, from options first and `INFISICAL_*` environment variables as fallback.
 *
 * The value is never logged - callers decide what to print.
 *
 * @returns Details of what was written
 * @throws An error if the credentials are invalid or the write fails
 */
export const setInfisicalSecret = async <TEnv = Environment>({
  environment,
  path = '/',
  key,
  value,
  createOnly = false,
  ...credentials
}: Options<TEnv>): Promise<SetSecretResult> => {
  const { client, projectId } = await createClient(credentials);

  const secretOptions = {
    environment:
      environment?.toString() ?? ('development' satisfies Environment),
    projectId,
    secretPath: path
  };

  if (createOnly) {
    await client
      .secrets()
      .createSecret(key, { ...secretOptions, secretValue: value });
    return { action: 'created', key, path };
  }

  /**
   * Whether the stored value already matches what we tried to write.
   *
   * Read the way consumers do, through `listSecretsWithImports` - a plain
   * `getSecret` returns an unusable value for tokens without permission to
   * view plaintext, which would make every check look like a mismatch.
   */
  const isWritten = async () => {
    try {
      const secrets = await client.secrets().listSecretsWithImports({
        ...secretOptions,
        expandSecretReferences: true
      });

      return secrets.some(
        ({ secretKey, secretValue }) =>
          secretKey === key && secretValue === value
      );
    } catch {
      return false;
    }
  };

  // Update first - the secret is expected to exist for a rotation.
  // Infisical has no upsert, so fall back to create only when it is missing.
  try {
    await client
      .secrets()
      .updateSecret(key, { ...secretOptions, secretValue: value });
    return { action: 'updated', key, path };
  } catch (error) {
    // A write can apply and still reject: Infisical answers the update with the
    // stored secret, so a token allowed to edit but not to read plaintext gets
    // a 403 for a change that landed. Trust the stored value over the response.
    if (await isWritten()) {
      return { action: 'updated', key, path };
    }

    if (!isNotFound(error)) {
      throw error;
    }
  }

  await client
    .secrets()
    .createSecret(key, { ...secretOptions, secretValue: value });
  return { action: 'created', key, path };
};
