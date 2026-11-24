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
    en: 'Text in columns',
    sv: 'Text i kolumner'
  },
  summary: {
    en: 'Rich text in one to four columns, with blocks allowed inside each.',
    sv: 'Redigerbar text i en till fyra spalter, där block får placeras i varje.'
  },
  whenToUse: {
    en: 'For the running text of a page. Each column holds rich text and can also hold blocks, such as an image or a code example, placed where they belong in the text. The width is set per column, and on a phone every column takes the full width.',
    sv: 'För sidans löpande text. Varje spalt innehåller formaterad text och kan också innehålla block, till exempel en bild eller ett kodexempel, placerade där de hör hemma i texten. Bredden ställs in per spalt, och i mobilen tar varje spalt hela bredden.'
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
