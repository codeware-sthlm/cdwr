import { existsSync } from 'fs';

import { getId } from '@codeware/app-cms/util/misc';
import type { Media } from '@codeware/shared/util/payload-types';
import { fetchFileByURL } from '@codeware/shared/util/ui';
import type { File, Payload, TypedLocale } from 'payload';

export type MediaData = Pick<Media, 'alt' | 'external' | 'tags' | 'tenant'> & {
  filename: string;
  filePath: string;
};

/**
 * Ensure that a media file exists with the given filename from the file path.
 *
 * It's assumed that seeded file names are not reused across file types.
 * Otherwise images could be seeded multiple times and thus create duplicates.
 *
 * @param payload - Payload instance
 * @param data - Media data
 * @param options - Seed options
 * @returns The created media file or the id if the media file exists
 */
export async function ensureMedia(
  payload: Payload,
  data: MediaData,
  options: {
    locale: TypedLocale;
    transactionID: string | number | undefined;
    /** Written on create only; an existing document is never claimed */
    managedBy?: string;
  }
): Promise<Media | number> {
  let remoteFile: File | undefined = undefined;
  let localFile: string | undefined = undefined;

  const { locale, transactionID, managedBy } = options;
  const { alt, external, filename, filePath, tags, tenant } = data;

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
      throw new Error(`Media file does not exist: ${localFile}`);
    }
  }

  if (!remoteFile && !localFile) {
    throw new Error(`Media file could not be resolved: ${filePath}`);
  }

  // File names should be unique by design
  const filenameWithoutExtension = filename.replace(/\.[^/.]+$/, '');

  // Check if the media file exists with the given filename and tenant
  const media = await payload.find({
    collection: 'media',
    where: {
      and: [
        { filename: { contains: filenameWithoutExtension } },
        tenant ? { tenant: { in: [getId(tenant)] } } : {}
      ]
    },
    depth: 0,
    limit: 1,
    req: { transactionID }
  });

  if (media.totalDocs) {
    return media.docs[0].id;
  }

  // No media file found, create one by uploading the local file

  const mediaFile = await payload.create({
    collection: 'media',
    data: {
      ...(managedBy ? { managedBy } : {}),
      alt,
      external,
      filename,
      tags,
      tenant
    },
    file: remoteFile,
    filePath: localFile,
    locale,
    req: { transactionID }
  });

  return mediaFile;
}
