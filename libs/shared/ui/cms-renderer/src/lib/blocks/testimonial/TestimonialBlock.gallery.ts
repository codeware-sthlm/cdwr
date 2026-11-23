import type { TestimonialBlock as TestimonialBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';
import { showcaseMedia } from '../gallery-media';

export const testimonialGallery: BlockGalleryDoc<TestimonialBlockProps> = {
  summary: {
    en: 'A quote from outside the site, with attribution.',
    sv: 'Ett externt citat, med angiven källa.'
  },
  whenToUse: {
    en: 'For a quote from a customer or a partner, with their name and role. Place it after the section the quote is about, such as the description of a service.',
    sv: 'För ett citat från en kund eller en samarbetspartner, med namn och roll. Placera det efter avsnittet som citatet handlar om, till exempel beskrivningen av en tjänst.'
  },
  example: {
    blockType: 'testimonial',
    quote:
      'The reporting we used to assemble by hand every quarter now generates itself, and it kept working after the person who built it moved on.',
    author: {
      name: 'A. Nilsson',
      role: 'Head of Finance Systems',
      avatar: showcaseMedia(
        'testimonial-portrait.jpg',
        'A fresnel lens seen face-on',
        1024,
        1024
      )
    },
    enableLink: true,
    link: {
      type: 'custom',
      label: 'Read the story',
      url: '/work',
      newTab: false
    }
  }
};
