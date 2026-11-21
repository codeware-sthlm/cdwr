import { Image } from '@codeware/shared/ui/image';
import type {
  ImageBlock as ImageBlockProps,
  StockMedia
} from '@codeware/shared/util/payload-types';
import React from 'react';

import { usePayload } from '../../providers/PayloadProvider';
import { RichText } from '../RichText';

import { resolveImageSources } from './image-sources';

type Props = {
  /**
   * Image to render, from either upload collection. `stock-media` documents
   * carry the same sizes as `media` but never a caption.
   */
  media: ImageBlockProps['media'] | StockMedia;
  hideCaption?: boolean;
};

/**
 * Renders image block with optional caption and alt text
 * with responsive image sizes.
 *
 * Suppresses caption if `hideCaption` is true, which is useful for hero images
 * where the caption is often redundant with the post title or not desired in the design.
 */
export const ImageBlock: React.FC<Props> = ({ hideCaption, media }) => {
  const { payloadUrl } = usePayload();

  if (!media || typeof media !== 'object') {
    return null;
  }

  const { alt } = media;
  const caption = 'caption' in media ? media.caption : undefined;

  const { src, sizes: responsiveSizes } = resolveImageSources(
    media,
    payloadUrl
  );

  return (
    <>
      {/* Rounded here rather than at each call site: every block that draws a
          picture wants the same corner, and the cards that already clip their
          own see nothing change */}
      <div className="[&_img]:rounded-xl">
        <Image
          sizes={responsiveSizes}
          src={src}
          alt={alt}
          height={media.height ?? undefined}
          width={media.width ?? undefined}
        />
      </div>
      {!hideCaption && caption && (
        <div className="mt-2">
          <RichText data={caption} />
        </div>
      )}
    </>
  );
};
