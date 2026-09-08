import type { ContentBlock as ContentBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

/**
 * A minimal Lexical document.
 *
 * Written out rather than imported from the rich text story: that one builds a
 * long editorial sample for reviewing typography, and the gallery wants two
 * short columns that sit beside each other.
 */
const prose = (text: string) =>
  ({
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      children: [
        {
          type: 'paragraph',
          version: 1,
          direction: 'ltr' as const,
          format: '' as const,
          indent: 0,
          children: [{ type: 'text', version: 1, text }]
        }
      ]
    }
    // The editor state is typed by the configured Lexical features, which a
    // fixture cannot satisfy without importing the editor itself
  }) as unknown as NonNullable<
    NonNullable<ContentBlockProps['columns']>[number]['richText']
  >;

export const contentGallery: BlockGalleryDoc<ContentBlockProps> = {
  name: {
    en: 'Prose, in columns',
    sv: 'Brödtext i spalter'
  },
  summary: {
    en: 'Rich text in one to four columns, with blocks allowed inside each.',
    sv: 'Redigerbar text i en till fyra spalter, där block får placeras i varje.'
  },
  whenToUse: {
    en: 'The default body of a page: anything that is written rather than composed. Each column takes prose and can hold blocks of its own, so an image or a code sample sits inside the argument instead of interrupting it. Widths are set per column, and every column becomes full width on a phone.',
    sv: 'Sidans vanliga brödtext: allt som skrivs snarare än sätts samman. Varje spalt tar text och kan innehålla egna block, så att en bild eller ett kodexempel hamnar inuti resonemanget i stället för att avbryta det. Bredden ställs in per spalt, och alla spalter blir fullbredd i mobilen.'
  },
  example: {
    blockType: 'content',
    columns: [
      {
        size: 'half',
        richText: prose(
          'Rich text is the default body of a page. It takes headings, lists, links and inline blocks, and it is what an editor reaches for when the words come first.'
        )
      },
      {
        size: 'half',
        richText: prose(
          'A second column is a layout decision, not a content one. Both columns collapse to full width on a phone, so nothing depends on them sitting side by side.'
        )
      }
    ]
  }
};
