import type { TestimonialBlock as TestimonialBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from './gallery-doc';

export const testimonialGallery: BlockGalleryDoc<TestimonialBlockProps> = {
  summary: {
    en: 'A quote from outside the site, with attribution.',
    sv: 'Ett citat utifrån, med angiven källa.'
  },
  whenToUse: {
    en: 'When a claim you have already made needs corroboration from someone who is not you. It reads as evidence set into the page rather than another thing being sold, which is why it is a surface with a rule and not a card.',
    sv: 'När ett påstående du redan gjort behöver bekräftas av någon annan än dig själv. Det läses som ett belägg infogat i sidan snarare än ännu något som säljs in, vilket är skälet till att det är en yta med en linje och inte ett kort.'
  },
  insteadReachFor: {
    en: 'Reach for callout when the sentence is your own — a testimonial with no name attached is worth less than no testimonial at all.',
    sv: 'Välj callout när meningen är din egen — ett omdöme utan namn är värt mindre än inget omdöme alls.'
  },
  example: {
    blockType: 'testimonial',
    quote:
      'The reporting we used to assemble by hand every quarter now generates itself, and it kept working after the person who built it moved on.',
    author: {
      name: 'A. Nilsson',
      role: 'Head of Finance Systems'
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
