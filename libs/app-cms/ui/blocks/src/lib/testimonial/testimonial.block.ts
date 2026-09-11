import { linkGroupField } from '@codeware/app-cms/ui/fields';
import type { TestimonialBlock } from '@codeware/shared/util/payload-types';
import type { Block, Condition, TypeWithID } from 'payload';

const isLinkEnabled: Condition<TypeWithID, TestimonialBlock> = (
  _,
  siblingData
) => siblingData?.enableLink === true;

/**
 * Testimonial block — someone else's sentence about the work.
 *
 * Everything around it is a claim made by the site about itself; this is the
 * one block where the claim comes from outside. That is the whole value, so
 * the quote and the name behind it are the only required fields: an
 * unattributed quote is worth less than no quote, but a missing logo costs
 * nothing.
 */
export const testimonialBlock: Block = {
  slug: 'testimonial',
  interfaceName: 'TestimonialBlock',
  labels: {
    singular: { en: 'Testimonial', sv: 'Omdöme' },
    plural: { en: 'Testimonials', sv: 'Omdömen' }
  },
  fields: [
    {
      name: 'quote',
      type: 'textarea',
      label: { en: 'Quote', sv: 'Citat' },
      admin: {
        description: {
          en: 'In their words, not yours. One or two sentences carry further than a paragraph.',
          sv: 'Med deras ord, inte dina. En eller två meningar bär längre än ett stycke.'
        }
      },
      localized: true,
      required: true
    },
    {
      name: 'author',
      type: 'group',
      label: { en: 'Attribution', sv: 'Källa' },
      admin: { hideGutter: true },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'name',
              type: 'text',
              label: { en: 'Name', sv: 'Namn' },
              required: true,
              admin: { width: '50%' }
            },
            {
              name: 'role',
              type: 'text',
              label: { en: 'Role and company', sv: 'Roll och företag' },
              localized: true,
              admin: { width: '50%' }
            }
          ]
        },
        {
          name: 'avatar',
          type: 'upload',
          relationTo: 'media',
          filterOptions: { mimeType: { contains: 'image' } },
          label: { en: 'Portrait', sv: 'Porträtt' }
        }
      ]
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      filterOptions: { mimeType: { contains: 'image' } },
      label: { en: 'Company mark', sv: 'Företagsmärke' },
      admin: {
        description: {
          en: 'Shown beside the quote. Leave empty when the name is enough.',
          sv: 'Visas bredvid citatet. Lämna tomt när namnet räcker.'
        }
      }
    },
    {
      name: 'enableLink',
      type: 'checkbox',
      label: {
        en: 'Link to the longer story',
        sv: 'Länka till hela berättelsen'
      }
    },
    linkGroupField({
      localizedLabel: true,
      overrides: {
        interfaceName: 'TestimonialLink',
        label: false,
        admin: { condition: isLinkEnabled }
      }
    })
  ]
};
