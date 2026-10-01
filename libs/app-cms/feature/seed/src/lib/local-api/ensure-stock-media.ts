import { existsSync } from 'fs';

import type { StockMedia } from '@codeware/shared/util/payload-types';
import { fetchFileByURL } from '@codeware/shared/util/ui';
import type { File, Payload } from 'payload';

export type StockMediaData = Pick<
  StockMedia,
  'alt' | 'credit' | 'licence' | 'subject'
> & {
  filename: string;
  filePath: string;
};

/**
 * Ensure that a stock image exists with the given filename.
 *
 * Stock media is platform-owned and has no tenant, so the filename alone is
 * unique across the library.
 *
 * @param payload - Payload instance
 * @param data - Stock media data
 * @param options - Seed options
 * @returns The created stock image or the id if it exists
 */
export async function ensureStockMedia(
  payload: Payload,
  data: StockMediaData,
  options: { transactionID: string | number | undefined }
): Promise<StockMedia | number> {
  const { transactionID } = options;
  const { filename, filePath, ...fields } = data;

  // Matched exactly: `contains` would let 'stock-hut-1' find 'stock-hut-10.jpg'.
  // Unlike media, stock filenames are never tenant-prefixed on upload.
  // Checked before touching the file at all — a delta seed should not fetch
  // or read what it is about to throw away
  const existing = await payload.find({
    collection: 'stock-media',
    where: { filename: { equals: filename } },
    depth: 0,
    limit: 1,
    req: { transactionID }
  });

  if (existing.totalDocs) {
    return existing.docs[0].id;
  }

  let remoteFile: File | undefined = undefined;
  let localFile: string | undefined = undefined;

  // Remote files are uploaded as buffers and local files are absolute filesystem paths
  if (filePath.match(/^http/)) {
    const file = await fetchFileByURL(filePath, 'nullOnError');
    if (file) {
      remoteFile = {
        name: file.name,
        data: Buffer.from(await file.arrayBuffer()),
        mimetype: file.type,
        size: file.size
      };
    }
  } else {
    localFile = filePath;
    if (!existsSync(localFile)) {
      throw new Error(`Stock media file does not exist: ${localFile}`);
    }
  }

  if (!remoteFile && !localFile) {
    throw new Error(`Stock media file could not be resolved: ${filePath}`);
  }

  const stockMedia = await payload.create({
    collection: 'stock-media',
    data: { ...fields, filename },
    file: remoteFile,
    filePath: localFile,
    req: { transactionID }
  });

  return stockMedia;
}
