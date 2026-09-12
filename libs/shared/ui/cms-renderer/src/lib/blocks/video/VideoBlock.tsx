import { Video } from '@codeware/shared/ui/video';
import type { VideoBlock as VideoBlockProps } from '@codeware/shared/util/payload-types';
import React from 'react';

import { usePayload } from '../../providers/PayloadProvider';
import { RichText } from '../RichText';

type Props = VideoBlockProps;

/**
 * Renders video block with optional caption and alt text.
 *
 * **Not ready for production use yet.**
 */
export const VideoBlock: React.FC<Props> = ({ media }) => {
  const { payloadUrl } = usePayload();

  if (!media || typeof media !== 'object') {
    return null;
  }

  const { alt, caption, url = '' } = media;

  const src = url?.startsWith('http') ? url : `${payloadUrl}/${url}`;

  return (
    <>
      <Video alt={alt} src={src} />
      {caption && (
        <div className="mt-2">
          <RichText data={caption} />
        </div>
      )}
    </>
  );
};
