import {
  codeField,
  sectionBandField,
  sectionHeaderFields
} from '@codeware/app-cms/ui/fields';
import { enumName } from '@codeware/app-cms/util/db';
import {
  type CodeLanguage,
  codeLanguages
} from '@codeware/app-cms/util/definitions';
import type { Block } from 'payload';

import { blockImages } from '../block-images';

/**
 * Code block for editing code with a language selector
 */
export const codeBlock: Block = {
  slug: 'code',
  admin: {
    images: blockImages(
      'code',
      'A code panel with window dots and lines of code'
    )
  },
  interfaceName: 'CodeBlock',
  labels: {
    plural: { en: 'Code', sv: 'Kod' },
    singular: { en: 'Code', sv: 'Kod' }
  },
  fields: [
    ...sectionHeaderFields({ headingRequired: false }),
    {
      type: 'select',
      name: 'language',
      label: { en: 'Language', sv: 'Språk' },
      enumName: enumName('code_language'),
      options: Object.entries(codeLanguages).map(([key, value]) => ({
        label: value,
        value: key
      })),
      required: true,
      defaultValue: 'ts' satisfies CodeLanguage
    },
    codeField,
    {
      name: 'visibleLines',
      type: 'number',
      label: { en: 'Visible lines', sv: 'Synliga rader' },
      min: 3,
      admin: {
        step: 1,
        description: {
          en: 'Longer code is cut off here and fades out, with a button to show all of it. Leave it empty to always show every line.',
          sv: 'Längre kod klipps här och tonas ut, med en knapp för att visa allt. Lämna tomt för att alltid visa alla rader.'
        }
      }
    },
    sectionBandField()
  ]
};
