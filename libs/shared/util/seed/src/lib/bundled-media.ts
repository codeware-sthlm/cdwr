/**
 * The media files that ship beside the definitions.
 *
 * Names only. The resolver that turns one into a path lives behind the
 * server-only entry point, because it needs `node:` builtins while this module
 * is reachable from the main barrel — and so from a browser bundle.
 */
export const BUNDLED_MEDIA = [
  'abstract-image-1.jpg',
  'abstract-image-2.jpg',
  'abstract-image-3.jpg',
  'data-1.json',
  'data-2.json',
  'document-1.pdf',
  'document-2.pdf',
  'text-1.txt',
  'text-2.txt',
  'word-1.docx',
  'word-2.docx'
] as const;

export type BundledMediaFile = (typeof BUNDLED_MEDIA)[number];
