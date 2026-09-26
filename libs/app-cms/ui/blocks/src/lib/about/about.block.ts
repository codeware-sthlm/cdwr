import { sectionBandField } from '@codeware/app-cms/ui/fields';
import type { Block } from 'payload';

/**
 * About block — renders the running app's deployment details
 * (`name@version+sha`, environment, build time).
 *
 * The details are runtime/build metadata supplied by the rendering app through
 * the cms-renderer `PayloadProvider` (`appInfo`), not authored content, so the
 * block only carries an optional heading.
 */
export const aboutBlock: Block = {
  slug: 'about',
  interfaceName: 'AboutBlock',
  labels: {
    plural: { en: 'About', sv: 'Om' },
    singular: { en: 'About', sv: 'Om' }
  },
  fields: [
    {
      type: 'text',
      name: 'heading',
      label: { en: 'Heading', sv: 'Rubrik' },
      admin: {
        description: {
          en: 'Optional heading shown above the deployment details.',
          sv: 'Valfri rubrik som visas ovanför distributionsdetaljerna.'
        }
      }
    },
    sectionBandField()
  ]
};
