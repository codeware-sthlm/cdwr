import { enumName } from '@codeware/app-cms/util/db';
import { adminGroups } from '@codeware/app-cms/util/definitions';
import { filterByTenantScope } from '@codeware/app-cms/util/filters';
import { canEdit, ensureTenantFromApiKey } from '@codeware/app-cms/util/misc';
import {
  assignCapacityStatus,
  guardStatusChange,
  notifySignup,
  renumberQueueOnChange,
  signupCreateAccess,
  stampStatusChange,
  verifyTourTenant
} from '@codeware/app-cms/util/tour-signups';
import type { TourSignup } from '@codeware/shared/util/payload-types';
import type { CollectionConfig, FieldAccess } from 'payload';

import { userOnlyAccess } from '../../security/user-only-access';

/** Anything a customer must never see, even indirectly */
const adminUserOnly: FieldAccess = ({ req: { user } }) => canEdit(user);

/**
 * Tour signups collection
 *
 * One customer's signup for one tour. Typed rather than built in the form
 * builder because the platform computes on it: `people` is the capacity unit,
 * and full, seats remaining and the waiting list all rest on it being a number
 * that nobody can rename away.
 *
 * Unlike form submissions these are editable — the guide promotes off the
 * waiting list, cancels a drop-off and keeps notes as the tour approaches.
 */
const tourSignups: CollectionConfig<'tour-signups'> = {
  slug: 'tour-signups',
  admin: {
    group: adminGroups.content,
    defaultColumns: ['name', 'tour', 'people', 'status', 'createdAt'],
    useAsTitle: 'name',
    description: {
      en: 'Customers who have signed up for a tour. The signup list also lives inside each tour, which is where you normally work with it.',
      sv: 'Kunder som har anmält sig till en resa. Anmälningslistan finns även inuti varje resa, där du normalt arbetar med den.'
    },
    components: {
      beforeListTable: [
        '@codeware/apps/cms/components/admin/tour-signups/TourFilterField'
      ]
    }
  },
  access: {
    // Signups are personal data: only admin users read them, never a tenant
    // api key. The site gets capacity from the tour instead.
    read: userOnlyAccess(),
    create: signupCreateAccess,
    update: userOnlyAccess(),
    delete: userOnlyAccess()
  },
  labels: {
    singular: { en: 'Tour signup', sv: 'Reseanmälan' },
    plural: { en: 'Tour signups', sv: 'Reseanmälningar' }
  },
  fields: [
    {
      name: 'tour',
      type: 'relationship',
      relationTo: 'tours',
      label: { en: 'Tour', sv: 'Resa' },
      required: true,
      index: true,
      filterOptions: ({ req }) => filterByTenantScope(req, 'tours'),
      admin: {
        description: {
          en: 'The tour this signup is for.',
          sv: 'Resan som anmälan gäller.'
        }
      }
    },
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
          name: 'people',
          type: 'number',
          label: { en: 'Party size', sv: 'Antal personer' },
          required: true,
          defaultValue: 1,
          min: 1,
          admin: {
            width: '50%',
            description: {
              en: 'How many people this signup is for. Capacity counts people, not signups.',
              sv: 'Hur många personer anmälan gäller. Kapaciteten räknar personer, inte anmälningar.'
            }
          }
        }
      ]
    },
    {
      type: 'row',
      fields: [
        {
          name: 'email',
          type: 'email',
          label: { en: 'Email', sv: 'E-post' },
          required: true,
          admin: { width: '50%' }
        },
        {
          name: 'phone',
          type: 'text',
          label: { en: 'Phone', sv: 'Telefon' },
          admin: {
            width: '50%',
            description: {
              en: 'Optional, but worth having on the day of departure.',
              sv: 'Valfritt, men bra att ha på avresedagen.'
            }
          }
        }
      ]
    },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          type: 'select',
          label: { en: 'Status', sv: 'Status' },
          enumName: enumName('tour_signups_status'),
          defaultValue: 'booked',
          required: true,
          index: true,
          options: [
            { label: { en: 'Booked', sv: 'Bokad' }, value: 'booked' },
            {
              label: { en: 'Waiting list', sv: 'Väntelista' },
              value: 'waiting'
            },
            { label: { en: 'Cancelled', sv: 'Avbokad' }, value: 'cancelled' }
          ],
          admin: {
            width: '50%',
            description: {
              en: 'Set when the customer signs up: booked while there is room, waiting list once the tour is full.',
              sv: 'Sätts när kunden anmäler sig: bokad så länge det finns plats, väntelista när resan är full.'
            }
          }
        },
        {
          name: 'queuePosition',
          type: 'number',
          label: { en: 'Queue position', sv: 'Köplats' },
          index: true,
          admin: {
            width: '50%',
            readOnly: true,
            description: {
              en: 'Place in the waiting list. Reorder the queue from the tour instead of editing this.',
              sv: 'Plats i väntelistan. Ändra ordningen från resan istället för att redigera detta.'
            },
            condition: (data) => data?.status === 'waiting'
          }
        }
      ]
    },
    {
      name: 'notes',
      type: 'textarea',
      label: { en: 'Notes', sv: 'Anteckningar' },
      access: {
        create: adminUserOnly,
        read: adminUserOnly,
        update: adminUserOnly
      },
      admin: {
        description: {
          en: 'Your own notes on this signup. Never shown to the customer.',
          sv: 'Dina egna anteckningar om anmälan. Visas aldrig för kunden.'
        }
      }
    },
    {
      name: 'statusChangedAt',
      type: 'date',
      label: { en: 'Status changed', sv: 'Status ändrad' },
      admin: {
        readOnly: true,
        disableListColumn: true,
        // Without an explicit format Payload mixes an en-US pattern with the
        // admin's language, which reads as neither
        date: {
          pickerAppearance: 'dayAndTime',
          displayFormat: 'yyyy-MM-dd HH:mm'
        }
      }
    },
    {
      name: 'termsAcceptedAt',
      type: 'date',
      label: { en: 'Terms accepted', sv: 'Villkor godkända' },
      admin: {
        readOnly: true,
        disableListColumn: true,
        date: {
          pickerAppearance: 'dayAndTime',
          displayFormat: 'yyyy-MM-dd HH:mm'
        },
        description: {
          en: 'When the customer accepted the terms, recorded by the server at signup.',
          sv: 'När kunden godkände villkoren, registrerat av servern vid anmälan.'
        }
      }
    },
    {
      name: 'anonymizedAt',
      type: 'date',
      label: { en: 'Anonymized', sv: 'Anonymiserad' },
      admin: {
        readOnly: true,
        hidden: true
      }
    }
  ],
  hooks: {
    beforeValidate: [ensureTenantFromApiKey<TourSignup>(), verifyTourTenant],
    // Capacity settles the status before the status change is stamped
    beforeChange: [assignCapacityStatus, guardStatusChange, stampStatusChange],
    // Renumber before notifying, so a promotion mail is sent against a queue
    // that already reads 1, 2, 3
    afterChange: [renumberQueueOnChange, notifySignup]
  }
};

export default tourSignups;
