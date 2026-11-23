import type { ImageBlock as ImageBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';
import { showcaseMedia } from '../gallery-media';

/** The caption is half of what this block is for, so the example carries one */
const caption = {
  root: {
    type: 'root',
    version: 1,
    direction: 'ltr',
    format: '',
    indent: 0,
    children: [
      {
        type: 'paragraph',
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        children: [
          {
            type: 'text',
            version: 1,
            text: 'Dichroic film, folded once: the same sheet reads a different colour at every angle.'
          }
        ]
      }
    ]
  }
  // The editor state is typed by the configured Lexical features, which a
  // fixture cannot satisfy without importing the editor itself
} as unknown as never;

export const imageGallery: BlockGalleryDoc<ImageBlockProps> = {
  summary: {
    en: 'One image with an optional caption beneath it.',
    sv: 'En bild med en valfri bildtext under.'
  },
  whenToUse: {
    en: 'For a single picture, such as a photo, a screenshot or a diagram, with a caption that says what it shows. It can be placed on its own or in a column of the Content block, next to the text it belongs to.',
    sv: 'För en enskild bild, till exempel ett foto, en skärmbild eller ett diagram, med en bildtext som säger vad bilden visar. Den kan placeras för sig eller i en spalt i blocket Innehåll, intill texten den hör till.'
  },
  example: {
    blockType: 'image',
    media: {
      ...showcaseMedia(
        'image.jpg',
        'A sheet of dichroic film, each fold a different colour',
        1264,
        848
      ),
      caption
    }
  }
};
