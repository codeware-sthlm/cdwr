/** TypeScript declarations for the editor, keyed by a virtual file system */
export type EditorTypes = {
  /** A content hash that names the set; the browser caches the file by its own ETag */
  version: string;
  /** Virtual path to content, e.g. `node_modules/@types/react/index.d.ts` */
  files: Record<string, string>;
  /** tsconfig-style `paths`, relative to the virtual root */
  paths: Record<string, string[]>;
};
