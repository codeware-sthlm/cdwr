import { mkdirSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Empty the upload folders that belong to the database.
 *
 * Uploads live on disk beside the database, so they go with it. Otherwise the
 * next seed's uploads collide with them and Payload stores suffixed copies,
 * which a lookup by filename no longer finds.
 *
 * @param mediaDir - The `MEDIA_DIR` the collections upload to
 */
export const emptyMediaFolders = (mediaDir: string): void => {
  const mediaRoot = path.resolve(dirname, '../..', mediaDir);
  for (const folder of ['media', 'stock-media']) {
    const dir = path.join(mediaRoot, folder);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
  console.log(`✅ Emptied media folders under ${mediaRoot}`);
};
