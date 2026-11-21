import {
  authenticatedAccess,
  systemUserAccess
} from '@codeware/app-cms/util/access';
import { FAQ_TOPICS, adminGroups } from '@codeware/app-cms/util/definitions';
import { hasRole } from '@codeware/app-cms/util/misc';
import type { CollectionConfig } from 'payload';

/**
 * FAQ collection
 *
 * Global help content (not tenant-scoped) rendered in the admin help drawer.
 * Managed by system users only but readable by all authenticated users.
 *
 * The platform's own entries come from `faq.ts` in the seed lib and are
 * applied at every host boot, so an edit to one of them here is overwritten.
 */
const faq: CollectionConfig = {
  slug: 'faq',
  admin: {
    group: adminGroups.settings,
    defaultColumns: ['question', 'topic'],
    useAsTitle: 'question',
    // Users consume FAQ content via the help drawer only
    hidden: ({ user }) => !hasRole(user, 'system-user'),
    description: {
      en: 'Questions and answers shown to all users in the admin help drawer, grouped by topic. The platform entries are restored from the code at every start, so change them there; an edit here is overwritten.',
      sv: 'Frågor och svar som visas för alla användare i hjälppanelen, grupperade efter ämne. Plattformens egna frågor återställs från koden vid varje start, så ändra dem där; en ändring här skrivs över.'
    }
  },
  orderable: true,
  access: {
    read: authenticatedAccess,
    create: systemUserAccess,
    update: systemUserAccess,
    delete: systemUserAccess
  },
  labels: {
    singular: { en: 'FAQ', sv: 'Vanlig fråga' },
    plural: { en: 'FAQ', sv: 'Vanliga frågor' }
  },
  fields: [
    {
      name: 'topic',
      type: 'select',
      label: { en: 'Topic', sv: 'Ämne' },
      options: FAQ_TOPICS.map(({ value, label }) => ({ value, label })),
      required: true,
      admin: {
        components: {
          // In the list, labelled in the content locale like the question
          Cell: '@codeware/apps/cms/components/FaqTopicCell.client'
        }
      }
    },
    {
      name: 'question',
      type: 'text',
      label: { en: 'Question', sv: 'Fråga' },
      localized: true,
      required: true
    },
    {
      name: 'answer',
      type: 'textarea',
      label: { en: 'Answer', sv: 'Svar' },
      admin: {
        description: {
          en: 'Plain text; line breaks are preserved.',
          sv: 'Vanlig text; radbrytningar bevaras.'
        }
      },
      localized: true,
      required: true
    }
  ]
};

export default faq;
