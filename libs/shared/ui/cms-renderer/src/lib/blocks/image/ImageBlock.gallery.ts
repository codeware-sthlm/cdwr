import type { ImageBlock as ImageBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';
import { galleryMedia } from '../gallery-media';

export const imageGallery: BlockGalleryDoc<ImageBlockProps> = {
  name: {
    en: 'A figure, with something to say about it',
    sv: 'En bild med en förklarande text'
  },
  summary: {
    en: 'One image with an optional caption beneath it.',
    sv: 'En bild med en valfri bildtext under.'
  },
  whenToUse: {
    en: 'When the picture carries part of the argument and deserves a line explaining what it shows. It sits inside a content column as readily as it sits on its own, so a diagram can be placed in the middle of the prose it belongs to.',
    sv: 'När bilden bär en del av resonemanget och förtjänar en rad som förklarar vad den visar. Den fungerar lika bra inuti en textspalt som på egen hand, så ett diagram kan placeras mitt i den text det hör till.'
  },
  example: {
    blockType: 'image',
    media: galleryMedia(
      'abstract-image-1.jpg',
      'An abstract composition in muted colour',
      800,
      533
    )
  }
};
