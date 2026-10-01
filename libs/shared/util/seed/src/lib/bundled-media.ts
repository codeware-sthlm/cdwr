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

/**
 * The platform's shared stock photo library, which ships beside the
 * definitions the same way a site's own media does.
 */
export const BUNDLED_STOCK_MEDIA = [
  'stock-hut-1.jpg',
  'stock-hut-2.jpg',
  'stock-rivervalley-1.jpg',
  'stock-rivervalley-2.jpg',
  'stock-rollinghills-2.jpg',
  'stock-terraces-1.jpg',
  'stock-terraces-2.jpg',
  'stock-terraces-3.jpg',
  'stock-village-1.jpg',
  'stock-village-2.jpg',
  'stock-village-3.jpg',
  'stock-vinerows-1.jpg',
  'stock-vinerows-2.jpg'
] as const;

export type BundledStockMediaFile = (typeof BUNDLED_STOCK_MEDIA)[number];
