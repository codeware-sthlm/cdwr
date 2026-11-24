import { enumName } from '@codeware/app-cms/util/db';
import type { SelectField } from 'payload';

/**
 * How the logos of a block are coloured: their own, or the site's brand
 * colour. One enum for every block that has the choice.
 */
export const logoColorField = (): SelectField => ({
  name: 'logoColor',
  type: 'select',
  label: { en: 'Logo colour', sv: 'Logotypens färg' },
  enumName: enumName('tech_logo_color'),
  defaultValue: 'own',
  options: [
    {
      label: { en: 'Their own colours', sv: 'Sina egna färger' },
      value: 'own'
    },
    {
      label: {
        en: 'The site’s brand colour',
        sv: 'Webbplatsens varumärkesfärg'
      },
      value: 'brand'
    }
  ],
  admin: {
    description: {
      en: 'With the brand colour, technology marks and SVG logos, fills and outlines alike, follow the site’s link colour. An uploaded image logo keeps its own colours.',
      sv: 'Med varumärkesfärgen följer teknikmärken och SVG-logotyper, både ytor och konturer, webbplatsens länkfärg. En uppladdad bildlogotyp behåller sina egna färger.'
    }
  }
});
