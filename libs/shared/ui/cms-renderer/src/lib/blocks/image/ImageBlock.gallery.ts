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
