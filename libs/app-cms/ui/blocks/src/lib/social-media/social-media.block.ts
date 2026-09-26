import {
  sectionBandField,
  socialLinksField
} from '@codeware/app-cms/ui/fields';
import { enumName } from '@codeware/app-cms/util/db';
import type { SocialMediaBlock } from '@codeware/shared/util/payload-types';
import type { Block, Condition, TypeWithID } from 'payload';

// Whether the block has multiple social
const multipleIcons: Condition<TypeWithID, SocialMediaBlock> = (
  _,
  siblingData
) => !!siblingData.social && siblingData.social.length > 1;

/**
 * Social media block for rendering social media links.
 */
export const socialMediaBlock: Block = {
  slug: 'social-media',
  interfaceName: 'SocialMediaBlock',
  labels: {
    plural: { en: 'Social Media', sv: 'Sociala Medier' },
    singular: { en: 'Social Media', sv: 'Sociala Media' }
  },
  fields: [
    socialLinksField({
      name: 'social',
      platformEnum: 'social_media_platform'
    }),
    {
      name: 'direction',
      type: 'radio',
      label: { en: 'Direction', sv: 'Riktning' },
      admin: {
        layout: 'horizontal',
        description: {
          en: 'How the social media links are displayed',
          sv: 'Hur länkarna ska visas'
        },
        condition: multipleIcons
      },
      enumName: enumName('social_media_direction'),
      options: [
        {
          label: { en: 'Horizontal', sv: 'Horisontell' },
          value: 'horizontal'
        },
        {
          label: { en: 'Vertical', sv: 'Vertikal' },
          value: 'vertical'
        }
      ],
      defaultValue: 'horizontal'
    },
    sectionBandField()
  ]
};
