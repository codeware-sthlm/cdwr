import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The media files that ship beside the definitions. */
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

/**
 * Where a bundled file actually is.
 *
 * Mirrors `readMediaFiles`, and has to: a deployed seed reads its media from
 * `SEED_DATA_URL` because the repository's files are not in the image, so a
 * definition that always resolved locally would fail every apply in preview
 * and production.
 *
 * Resolved when called, never at module scope — a definition is reachable from
 * the cms build graph, and evaluating this while Next collects page data is
 * what broke the build once already.
 *
 * @param file - A file that ships with the seed
 * @param remoteDataUrl - Where media is served from, when it is not local
 * @returns An http(s) URL when one is given, otherwise an absolute path
 */
export const bundledMediaPath = (
  file: BundledMediaFile,
  remoteDataUrl?: string
): string => {
  if (remoteDataUrl) {
    // A trailing slash makes the filename a child rather than replacing the
    // last segment, the same way `readMediaFiles` builds its URLs
    return new URL(file, `${remoteDataUrl.replace(/\/$/, '')}/`).href;
  }

  // `fileURLToPath` rather than `.pathname`, which percent-encodes — a
  // checkout under a path with a space would not exist
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    'static-data/media',
    file
  );
};
