import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * The file-area fixtures every tenant is seeded with, read by name both
 * locally and remotely. Images a definition states itself also live in the
 * 'media' directory, and are not among them.
 */
const remoteMediaFiles = [
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

/**
 * Stock image file names expected to be available remotely for seeding.
 *
 * The shared platform library — atmospheric wine-country landscapes offered to
 * every tenant. Keep in sync with the files in the 'stock-media' directory.
 */
const remoteStockMediaFiles = [
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

/** Read files from a remote url, or from a local directory as fallback. */
const readFiles = (
  directory: string,
  remoteFiles: readonly string[],
  remoteDataUrl: string | undefined
): { filePath: string; filename: string }[] => {
  if (remoteDataUrl) {
    // A trailing slash makes the filename resolve as a child rather than
    // replacing the last segment. `path.join` would collapse `https://` to
    // `https:/`, which fetch tolerates but every log line then shows.
    const base = new URL(`${remoteDataUrl.replace(/\/$/, '')}/`);

    return remoteFiles.map((filename) => ({
      filePath: new URL(filename, base).href,
      filename
    }));
  }

  const filename = fileURLToPath(import.meta.url);
  const dirname = path.dirname(filename);

  return (
    readdirSync(path.resolve(dirname, directory), {
      encoding: 'utf-8',
      recursive: false,
      withFileTypes: true
    })
      // The same named files as remotely, not whatever else shares the folder:
      // a definition's own images live beside these and are no one's file area
      .filter((file) => file.isFile() && remoteFiles.includes(file.name))
      .map(({ name, parentPath }) => ({
        filePath: path.resolve(parentPath, name),
        filename: name
      }))
  );
};

/**
 * Reads the shared stock image library either from a remote URL
 * or from the local 'stock-media' directory.
 */
export const readStockMediaFiles = (remoteDataUrl: string | undefined) =>
  readFiles('stock-media', remoteStockMediaFiles, remoteDataUrl);

/**
 * Reads media files either from a remote URL
 * or from the local 'media' directory.
 */
export const readMediaFiles = (remoteDataUrl: string | undefined) =>
  readFiles('media', remoteMediaFiles, remoteDataUrl);
