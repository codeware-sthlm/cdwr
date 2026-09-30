/**
 * The media files that ship beside the definitions.
 *
 * Names only. The resolver that turns one into a path lives behind the
 * server-only entry point, because it needs `node:` builtins while this module
 * is reachable from the main barrel — and so from a browser bundle.
 */
export const BUNDLED_MEDIA = [
  'astronomer-avatar.png',
  'crater-field.png',
  'data-1.json',
  'data-2.json',
  'document-1.pdf',
  'document-2.pdf',
  'earthrise.png',
  'moon-landscape.png',
  'moon-phases.png',
  'observing-night.png',
  'text-1.txt',
  'text-2.txt',
  'word-1.docx',
  'word-2.docx'
] as const;

export type BundledMediaFile = (typeof BUNDLED_MEDIA)[number];
