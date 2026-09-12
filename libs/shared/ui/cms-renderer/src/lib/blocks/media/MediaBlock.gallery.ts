import type { MediaBlock as MediaBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';
import { showcaseMedia } from '../gallery-media';

export const mediaGallery: BlockGalleryDoc<MediaBlockProps> = {
  name: {
    en: 'Whatever the upload turned out to be',
    sv: 'Vad uppladdningen än visade sig vara'
  },
  summary: {
    en: 'An image or a video, drawn according to what was uploaded. Retired: the image and video blocks replace it.',
    sv: 'En bild eller en video, som ritas upp efter vad som laddats upp. Utgått: bild- och videoblocken ersätter det.'
  },
  whenToUse: {
    en: 'Nothing new should reach for it. It reads the file type and picks a treatment, which the image and video blocks now each do properly, with a caption where a caption belongs. Pages already carrying one keep drawing it, which is why it is still here and still described.',
    sv: 'Inget nytt ska använda det. Det läser filtypen och väljer en hantering, vilket bild- och videoblocken numera gör var för sig och ordentligt, med bildtext där en bildtext hör hemma. Sidor som redan har ett ritar upp det som förut, och därför finns det kvar och beskrivs här.'
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
