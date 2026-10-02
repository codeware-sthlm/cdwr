/** Monaco picks the script kind from the extension, so `.tsx` turns JSX on. */
export const tsxModelUri = (path: string): string =>
  `inmemory://cms/${path.replaceAll('.', '/')}.tsx`;
