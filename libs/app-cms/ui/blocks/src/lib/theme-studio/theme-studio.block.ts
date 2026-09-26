import {
  sectionBandField,
  sectionHeaderFields
} from '@codeware/app-cms/ui/fields';
import { SITE_THEMES, themeLabel } from '@codeware/shared/theme';
import type { Block } from 'payload';

/**
 * Theme studio block — the real studio, in a page.
 *
 * Not a lighter version and not a picture of it. The block renders the same
 * component the admin's theme library opens, with the two things that write
 * anywhere switched off: no export to committed files, no save to a site.
 * What a visitor sees is exactly what an editor gets, which is the whole
 * claim a showcase can make about it.
 *
 * Deliberately little to set. A demo that can be configured into something
 * other than the studio is a demo of something else.
 */
export const themeStudioBlock: Block = {
  slug: 'theme-studio',
  interfaceName: 'ThemeStudioBlock',
  labels: {
    singular: { en: 'Theme studio', sv: 'Temastudio' },
    plural: { en: 'Theme studios', sv: 'Temastudior' }
  },
  fields: [
    ...sectionHeaderFields({ headingRequired: false }),
    {
      name: 'startFrom',
      type: 'select',
      label: { en: 'Open with', sv: 'Öppna med' },
      admin: {
        description: {
          en: 'The platform theme the studio starts from. Its recipe is read from the committed theme, so the studio opens on the real thing.',
          sv: 'Plattformstemat studion utgår från. Receptet läses från det incheckade temat, så studion öppnar det riktiga.'
        }
      },
      options: SITE_THEMES.map((value) => ({
        value,
        label: themeLabel(value)
      })),
      defaultValue: 'spotlight',
      required: true
    },
    {
      name: 'note',
      type: 'text',
      label: { en: 'Note above the studio', sv: 'Notis ovanför studion' },
      admin: {
        description: {
          en: 'One line saying what this is. Leave the default unless it is wrong for the page.',
          sv: 'En rad som säger vad detta är. Behåll standardtexten om den inte är fel för sidan.'
        }
      },
      localized: true,
      defaultValue:
        'Live — the studio itself, not a screenshot of it. Nothing you do here leaves your browser.'
    },
    sectionBandField()
  ]
};
