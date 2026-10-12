import { type Credentials, createClient } from './create-client';
import { type Environment } from './infisical.schemas';
import { splitFolderPath } from './split-folder-path';

type Options<TEnv> = Credentials & {
  /** Required, like the delete it previews */
  environment: TEnv;

  /**
   * Full path of the folder to inspect, such as `/tenants/moon`.
   */
  path: string;
};

export interface FolderInspection {
  path: string;
  /** Secrets held by the folder itself, not imported and not in subfolders */
  secrets: number;
}

const joinPath = (parent: string, name: string) =>
  parent === '/' ? `/${name}` : `${parent}/${name}`;

/**
 * List a folder and every folder below it, with how many secrets each holds
 * itself. This is what `deleteInfisicalFolder` removes. Counts only; secret
 * values are never returned.
 *
 * @returns The folders sorted by path, the given one first, or `null` when
 * there is no such folder
 * @throws An error if the credentials are invalid or a read fails
 */
export const inspectInfisicalFolder = async <TEnv = Environment>({
  environment,
  path,
  ...credentials
}: Options<TEnv>): Promise<FolderInspection[] | null> => {
  const { client, projectId } = await createClient(credentials);
  const env = String(environment);
  const { parent, name } = splitFolderPath(path);

  const subfolders = async (at: string) =>
    (
      await client
        .folders()
        .listFolders({ projectId, environment: env, path: at })
    ).map((folder) => joinPath(at, folder.name));

  const target = joinPath(parent, name);
  if (!(await subfolders(parent)).includes(target)) {
    return null;
  }

  const found: FolderInspection[] = [];
  let level = [target];

  while (level.length > 0) {
    const counted = await Promise.all(
      level.map(async (folder) => ({
        path: folder,
        secrets: (
          await client.secrets().listSecrets({
            projectId,
            environment: env,
            secretPath: folder,
            recursive: false,
            includeImports: false
          })
        ).secrets.length
      }))
    );
    found.push(...counted);
    level = (await Promise.all(level.map(subfolders))).flat();
  }

  return found.sort((a, b) => a.path.localeCompare(b.path));
};
