/** Why a path is not safe to delete, or `undefined` when it is */
export const pathProblem = (path: string): string | undefined => {
  if (!path.startsWith('/')) return 'The path must start with /';
  if (path.endsWith('/')) return 'The path must not end with /';
  if (path.split('/').includes('..')) return 'The path must not contain ..';
  if (path.split('/').filter(Boolean).length < 2) {
    return 'The path must be at least two levels deep, such as /tenants/moon';
  }
  return undefined;
};

interface PlannedFolder {
  path: string;
  secrets: number;
}

/** Whether two folder listings hold the same folders with the same counts */
export const sameFolders = (
  a: ReadonlyArray<PlannedFolder>,
  b: ReadonlyArray<PlannedFolder>
): boolean =>
  a.length === b.length &&
  a.every(
    (folder, i) =>
      folder.path === b[i]?.path && folder.secrets === b[i]?.secrets
  );
