import type { GalleryBlock as GalleryBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';
import { showcaseMedia } from '../gallery-media';

export const galleryGallery: BlockGalleryDoc<GalleryBlockProps> = {
  name: {
    en: 'Photos from the trips',
    sv: 'Bilder från resorna'
  },
  summary: {
    en: 'A heading above a set of photos, as a collage or an even row.',
    sv: 'En rubrik över en uppsättning bilder, som kollage eller i en jämn rad.'
  },
  whenToUse: {
    en: 'Use it where the pictures carry the point better than text would, such as a page about trips or a place. The collage suits a mood, with some photos wide or tall; the row suits pictures that each need a caption.',
    sv: 'Använd det där bilderna bär budskapet bättre än text, till exempel på en sida om resor eller en plats. Kollaget passar när det handlar om en stämning, med några bilder breda eller höga; raden passar när varje bild behöver en bildtext.'
  },
  example: {
    blockType: 'gallery',
    eyebrow: 'On the road',
    heading: 'Photos from the trips',
    intro:
      'A few frames from the last season, pinned up in no particular order.',
    layout: 'collage',
    items: [
      {
        image: showcaseMedia(
          'hero.jpg',
          'A bundle of fibre-optic strands fanning out, each tip lit',
          1376,
          768
        ),
        size: 'wide',
        caption: 'Fibre bundle'
      },
      {
        image: showcaseMedia(
          'testimonial-portrait.jpg',
          'A fresnel lens seen face-on',
          1024,
          1024
        ),
        size: 'tall',
        caption: 'Fresnel lens'
      },
      {
        image: showcaseMedia(
          'image.jpg',
          'A sheet of dichroic film, each fold a different colour',
          1264,
          848
        ),
        size: 'normal',
        caption: 'Dichroic film'
      },
      {
        image: showcaseMedia(
          'callout.jpg',
          'A cluster of acrylic rods, each glowing at its cut top',
          1264,
          848
        ),
        size: 'normal',
        caption: 'Acrylic rods'
      },
      {
        image: showcaseMedia(
          'feature-section.jpg',
          'A receding row of edge-lit acrylic panels',
          1376,
          768
        ),
        size: 'normal',
        caption: 'Edge-lit panels'
      }
    ]
  }
};
