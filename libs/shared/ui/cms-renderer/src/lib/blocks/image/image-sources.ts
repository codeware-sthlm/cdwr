import type { Size } from '@codeware/shared/ui/image';
import type { Media, StockMedia } from '@codeware/shared/util/payload-types';

/**
 * Turns a media document into what the shared `Image` takes: an absolute `src`
 * and the responsive sizes, each with its own absolute url.
 *
 * An `http` url is passed through untouched, which is what lets the gallery's
 * examples point at remote storage while uploads resolve against the Payload
 * origin.
 */
export function resolveImageSources(
  media: Media | StockMedia,
  payloadUrl: string
): { src: string; sizes: Array<Size> } {
  const { sizes = {}, url = '' } = media;

  const src = url?.startsWith('http') ? url : `${payloadUrl}${url}`;
  const mediaSizes = Object.values(sizes ?? {});

  // Convert media sizes to responsive image sizes
  let sizeCount = 0;
  const responsiveSizes = mediaSizes.reduce((acc, mediaSize) => {
    sizeCount++;
    if (!mediaSize.url) {
      return acc;
    }
    const size = {
      src: mediaSize.url?.startsWith('http')
        ? mediaSize.url
        : `${payloadUrl}${mediaSize.url}`,
      width: mediaSize.width ?? undefined,
      mimeType: mediaSize.mimeType ?? undefined,
      ignoreMedia: false
    };
    acc.push(size);
    // Append a copy of the last size with ignored media query
    // to ensure a modern image format is used as fallback
    // before the component fallback image
    if (sizeCount === mediaSizes.length) {
      acc.push({ ...size, ignoreMedia: true });
    }
    return acc;
  }, [] as Array<Size>);

  return { src, sizes: responsiveSizes };
}
