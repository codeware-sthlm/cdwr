import { illustrationField } from '@codeware/app-cms/ui/fields';
import type { Block, TextFieldSingleValidation } from 'payload';

import { anchorFormat } from '../anchor';
import { blockImages } from '../block-images';

const illustration = illustrationField();

/**
 * Coming soon block — a full-screen temporary landing page.
 *
 * A badge, a heading, a message, an optional opening date and contact details,
 * and an optional button that opens a form block on the same page. Meant to
 * stand alone on a tenant's page until the real site is ready.
 */
export const comingSoonBlock: Block = {
  slug: 'coming-soon',
  admin: {
    images: blockImages(
      'coming-soon',
      'A centered page with a mark, a heading, a line of text and a button'
    )
  },
  interfaceName: 'ComingSoonBlock',
  labels: {
    singular: { en: 'Coming soon', sv: 'Kommer snart' },
    plural: { en: 'Coming soon', sv: 'Kommer snart' }
  },
  fields: [
    {
      name: 'badge',
      type: 'text',
      label: { en: 'Badge', sv: 'Etikett' },
      localized: true,
      admin: {
        description: {
          en: 'A short line above the heading, such as "Opening soon".',
          sv: 'En kort rad ovanför rubriken, till exempel "Öppnar snart".'
        }
      }
    },
    {
      name: 'heading',
      type: 'text',
      label: { en: 'Heading', sv: 'Rubrik' },
      localized: true,
      required: true
    },
    {
      name: 'message',
      type: 'textarea',
      label: { en: 'Message', sv: 'Meddelande' },
      localized: true
    },
    {
      name: 'openingDate',
      type: 'date',
      label: { en: 'Opening date', sv: 'Öppningsdatum' },
      admin: {
        date: { pickerAppearance: 'dayOnly' },
        description: {
          en: 'Optional. Shown as "Opening <date>" in the site’s language.',
          sv: 'Valfritt. Visas som "Öppnar <datum>" på sidans språk.'
        }
      }
    },
    {
      name: 'contactEmail',
      type: 'email',
      label: { en: 'Contact email', sv: 'Kontakt-e-post' }
    },
    {
      name: 'contactPhone',
      type: 'text',
      label: { en: 'Contact phone', sv: 'Kontakttelefon' }
    },
    {
      name: 'notifyLabel',
      type: 'text',
      label: { en: 'Notify button', sv: 'Aviseringsknapp' },
      localized: true,
      admin: {
        description: {
          en: 'The label of a button that opens a form, such as "Notify me". Empty means no button.',
          sv: 'Texten på en knapp som öppnar ett formulär, till exempel "Avisera mig". Tomt betyder ingen knapp.'
        }
      }
    },
    {
      name: 'notifyAnchor',
      type: 'text',
      label: { en: 'Form anchor', sv: 'Formulärets ankare' },
      admin: {
        condition: (_, siblingData) => Boolean(siblingData?.notifyLabel),
        description: {
          en: 'The anchor of a Form block on this page set to Overlay. The button opens that form.',
          sv: 'Ankaret för ett formulärblock på den här sidan som är satt till Överlägg. Knappen öppnar det formuläret.'
        }
      },
      validate: ((value, { siblingData }) => {
        if (!value) {
          return (siblingData as { notifyLabel?: string } | undefined)
            ?.notifyLabel
            ? 'A button needs the anchor of the form it opens'
            : true;
        }
        return anchorFormat(value);
      }) satisfies TextFieldSingleValidation
    },
    {
      name: 'showIllustration',
      type: 'checkbox',
      defaultValue: true,
      label: { en: 'Show a drawing', sv: 'Visa en teckning' }
    },
    {
      ...illustration,
      admin: {
        ...illustration.admin,
        condition: (_, siblingData) => siblingData?.showIllustration !== false,
        description: {
          en: 'SVG code drawn in place of the built-in drawing of the site’s pages coming home. Empty keeps the built-in one. Colours can use the theme, such as var(--brand-500).',
          sv: 'SVG-kod som ritas i stället för den inbyggda teckningen av webbplatsens sidor som kommer hem. Tomt behåller den inbyggda. Färger kan hämtas från temat, till exempel var(--brand-500).'
        }
      }
    }
  ]
};
