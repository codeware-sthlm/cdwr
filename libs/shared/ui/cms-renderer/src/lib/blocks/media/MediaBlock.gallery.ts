import type { MediaBlock as MediaBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';
import { showcaseMedia } from '../gallery-media';

export const mediaGallery: BlockGalleryDoc<MediaBlockProps> = {
  name: {
    en: 'Whatever the upload turned out to be',
    sv: 'Vad uppladdningen än visade sig vara'
  },
  summary: {
    en: 'An image or a video, drawn according to what was uploaded.',
    sv: 'En bild eller en video, som ritas upp efter vad som laddats upp.'
  },
  whenToUse: {
    en: 'When the entry may be either and the page should not care. It reads the file type and picks the right treatment, which suits a slot filled by different editors at different times — the image block is the better choice when a caption is part of the point.',
    sv: 'När posten kan vara antingen och sidan inte ska behöva bry sig. Den läser filtypen och väljer rätt hantering, vilket passar en plats som olika redaktörer fyller vid olika tillfällen — bildblocket är bättre när bildtexten är en del av poängen.'
  },
  example: {
    blockType: 'media',
    media: showcaseMedia(
      'media.jpg',
      'Backlit woven steel mesh, moire rippling across the weave',
      1264,
      848
    )
  }
};
