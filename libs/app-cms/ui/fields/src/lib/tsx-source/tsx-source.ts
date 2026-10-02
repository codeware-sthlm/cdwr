/** Monaco picks the script kind from the extension, so `.tsx` turns JSX on. */
export const tsxModelUri = (path: string): string =>
  `inmemory://cms/${path.replaceAll('.', '/')}.tsx`;

/** The TypeScript formatter reads its indentation from the model. */
export const indentOptions = { tabSize: 2, insertSpaces: true } as const;
