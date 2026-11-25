import type { Field } from 'payload';

type Options = {
  /**
   * Whether the heading is required.
   *
   * @default true
   */
  headingRequired?: boolean;
};

/**
 * Shared section header fields — eyebrow, heading and intro.
 *
 * These three fields recur across most marketing sections (feature cards,
 * showcase, pill list). Define the trio once and spread it into a block's
 * fields so every section header stays consistent:
 *
 * @example
 * fields: [
 *   ...sectionHeaderFields(),
 *   // ...section-specific fields
 * ]
 */
export const sectionHeaderFields = ({
  headingRequired = true
}: Options = {}): Array<Field> => [
  {
    name: 'eyebrow',
    type: 'text',
    label: { en: 'Eyebrow', sv: 'Överrubrik' },
    admin: {
      description: {
        en: 'Small uppercase label shown above the heading',
        sv: 'Liten versal etikett som visas ovanför rubriken'
      }
    },
    localized: true
  },
  {
    name: 'heading',
    type: 'text',
    label: { en: 'Heading', sv: 'Rubrik' },
    localized: true,
    required: headingRequired
  },
  {
    name: 'intro',
    type: 'textarea',
    label: { en: 'Intro', sv: 'Ingress' },
    admin: {
      description: {
        en: 'Short paragraph below the heading. Wrap code in `backticks`.',
        sv: 'Kort stycke under rubriken. Omge kod med `backticks`.'
      }
    },
    localized: true
  }
];
