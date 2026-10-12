/** Split a folder path into the parent path and the folder name */
export const splitFolderPath = (
  path: string
): { parent: string; name: string } => {
  const segments = path.split('/').filter(Boolean);
  const name = segments.pop();

  if (!name) {
    throw new Error('Cannot use the root folder');
  }

  return { parent: `/${segments.join('/')}`, name };
};
