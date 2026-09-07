import { slugField } from '@codeware/app-cms/ui/fields';
import { multiTenantLinkFeature } from '@codeware/app-cms/ui/lexical';
import { seoTab } from '@codeware/app-cms/ui/tabs';
import { enumName } from '@codeware/app-cms/util/db';
import { adminGroups } from '@codeware/app-cms/util/definitions';
import { filterByTenantScope } from '@codeware/app-cms/util/filters';
import { customT } from '@codeware/app-cms/util/i18n';
import type { BlockSlug } from '@codeware/shared/util/payload-types';
import { getActiveKeys } from '@codeware/shared/util/pure';
import { BlocksFeature, lexicalEditor } from '@payloadcms/richtext-lexical';
import type { CollectionConfig } from 'payload';

import { userOnlyAccess } from '../../security/user-only-access';
import { userOrApiKeyAccess } from '../../security/user-or-api-key-access';

import { populateTourCapacity } from './hooks/populate-capacity.hook';

/**
 * Define which blocks are available for the rich text editor.
 */
// Using a record to make sure all blocks are included and not forgotten
const blocks: Record<BlockSlug, boolean> = {
  about: false,
  card: true,
  code: true,
  image: true,
  media: true,
  'social-media': true,
  spacing: true,
  testimonial: false,
  // Unsupported blocks
  callout: false,
  content: false,
  'feature-cards': false,
  'feature-section': false,
  'file-area': false,
  form: false,
  hero: false,
  'pill-list': false,
  posts: false,
  'reusable-content': false,
  showcase: false,
  tours: false,
  video: false
};

/**
 * Tours collection
 *
 * Product-like content: structured facts an editor fills in on a form, a
 * day-by-day itinerary and free-style rich text for everything that doesn't
 * fit the structure.
 */
const tours: CollectionConfig<'tours'> = {
  slug: 'tours',
  admin: {
    group: adminGroups.content,
    defaultColumns: ['title', 'destination', 'signups', 'updatedAt', '_status'],
    useAsTitle: 'title',
    description: {
      en: 'Tours are the products you sell. Describe the trip, plan the days and publish when ready.',
      sv: 'Resor är de produkter du säljer. Beskriv resan, planera dagarna och publicera när det är klart.'
    }
  },
  access: {
    read: userOrApiKeyAccess(true),
    readVersions: userOnlyAccess({ tenantPath: 'version.tenant' }),
    create: userOnlyAccess(),
    update: userOnlyAccess(),
    delete: userOnlyAccess()
  },
  labels: {
    singular: { en: 'Tour', sv: 'Resa' },
    plural: { en: 'Tours', sv: 'Resor' }
  },
  fields: [
    {
      name: 'title',
      label: { en: 'Title', sv: 'Titel' },
      type: 'text',
      required: true,
      localized: true,
      admin: {
        description: {
          en: 'The name of the tour, used in listings and navigation.',
          sv: 'Resans namn som används i listor och navigering.'
        }
      }
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: { en: 'Details', sv: 'Detaljer' },
          fields: [
            {
              name: 'heroImage',
              type: 'upload',
              // Shared platform library first, the workspace's own media second
              relationTo: ['stock-media', 'media'],
              label: { en: 'Header image', sv: 'Toppbild' },
              required: true,
              // `media` holds every file type; both collections carry a mime
              // type so one filter narrows the picker to images
              filterOptions: { mimeType: { contains: 'image' } },
              admin: {
                description: {
                  en: 'Pick a shared image to set the mood, or upload your own photo of the actual places for an accurate one.',
                  sv: 'Välj en delad bild för att sätta stämningen, eller ladda upp ett eget foto av de verkliga platserna för en korrekt bild.'
                }
              }
            },
            {
              name: 'summary',
              type: 'textarea',
              label: { en: 'Summary', sv: 'Sammanfattning' },
              localized: true,
              required: true,
              admin: {
                description: {
                  en: 'Short teaser shown on listing cards.',
                  sv: 'Kort text som visas på listkorten.'
                }
              }
            },
            {
              name: 'destination',
              type: 'text',
              label: { en: 'Destination', sv: 'Resmål' },
              localized: true,
              required: true,
              admin: {
                description: {
                  en: 'Where the tour takes place, e.g. "Tuscany, Italy".',
                  sv: 'Var resan äger rum, t.ex. "Toscana, Italien".'
                }
              }
            },
            {
              name: 'duration',
              type: 'text',
              label: { en: 'Duration', sv: 'Längd' },
              localized: true,
              admin: {
                description: {
                  en: 'How long the tour lasts, e.g. "7 days".',
                  sv: 'Hur lång resan är, t.ex. "7 dagar".'
                }
              }
            },
            {
              name: 'intent',
              type: 'radio',
              label: {
                en: 'How customers sign up',
                sv: 'Hur kunder anmäler sig'
              },
              enumName: enumName('tours_intent'),
              defaultValue: 'booking',
              required: true,
              admin: {
                layout: 'horizontal',
                description: {
                  en: 'Booking commits the customer and you invoice afterwards. Register interest is non-binding — use it when the departure is not confirmed yet.',
                  sv: 'Bokning binder kunden och du fakturerar i efterhand. Intresseanmälan är inte bindande — använd den när avresan inte är bekräftad.'
                }
              },
              options: [
                { label: { en: 'Booking', sv: 'Bokning' }, value: 'booking' },
                {
                  label: { en: 'Register interest', sv: 'Intresseanmälan' },
                  value: 'interest'
                }
              ],
              // A tour cannot be booked before it has a date to be booked for
              validate: (value, { req, siblingData }) => {
                const { departureDate } = siblingData as {
                  departureDate?: string | null;
                };
                if (value === 'booking' && !departureDate) {
                  return customT(req.t)('validation:bookingNeedsDeparture');
                }
                return true;
              }
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'departureDate',
                  type: 'date',
                  label: { en: 'Departure', sv: 'Avresa' },
                  admin: {
                    width: '50%',
                    date: { pickerAppearance: 'dayOnly' },
                    description: {
                      en: 'The day the tour departs. Leave empty while the date is unconfirmed.',
                      sv: 'Dagen då resan avgår. Lämna tom så länge datumet inte är fastställt.'
                    }
                  }
                },
                {
                  name: 'bookingDeadline',
                  type: 'date',
                  label: { en: 'Sign up before', sv: 'Anmälan senast' },
                  admin: {
                    width: '50%',
                    date: { pickerAppearance: 'dayOnly' },
                    description: {
                      en: 'The last day customers can sign up. Optional.',
                      sv: 'Sista dagen kunder kan anmäla sig. Valfritt.'
                    }
                  },
                  // Only meaningful once both dates exist
                  validate: (value, { req, siblingData }) => {
                    const { departureDate } = siblingData as {
                      departureDate?: string | null;
                    };
                    if (!value || !departureDate) {
                      return true;
                    }
                    return new Date(value) <= new Date(departureDate)
                      ? true
                      : customT(req.t)(
                          'validation:bookingDeadlineAfterDeparture'
                        );
                  }
                }
              ]
            },
            {
              name: 'departureNote',
              type: 'text',
              label: { en: 'Planned timing', sv: 'Planerad tidpunkt' },
              localized: true,
              admin: {
                // Only relevant while there is no date to show
                condition: (_, siblingData) => !siblingData?.departureDate,
                description: {
                  en: 'Shown instead of a departure date, e.g. "Autumn 2027 — dates to be confirmed".',
                  sv: 'Visas istället för avresedatum, t.ex. "Hösten 2027 — datum ej fastställt".'
                }
              }
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'price',
                  type: 'number',
                  label: { en: 'Price', sv: 'Pris' },
                  min: 0,
                  required: true,
                  admin: {
                    width: '50%',
                    description: {
                      en: 'Price per person, excluding currency.',
                      sv: 'Pris per person, exklusive valuta.'
                    }
                  }
                },
                {
                  name: 'currency',
                  type: 'select',
                  label: { en: 'Currency', sv: 'Valuta' },
                  enumName: enumName('tours_currency'),
                  defaultValue: 'EUR',
                  required: true,
                  options: [
                    { label: 'EUR (€)', value: 'EUR' },
                    { label: 'SEK (kr)', value: 'SEK' },
                    { label: 'USD ($)', value: 'USD' },
                    { label: 'GBP (£)', value: 'GBP' }
                  ],
                  admin: { width: '50%' }
                }
              ]
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'maxCustomers',
                  type: 'number',
                  label: { en: 'Maximum customers', sv: 'Max antal kunder' },
                  min: 1,
                  admin: {
                    width: '50%',
                    description: {
                      en: 'How many people the tour has room for. Counts people, not signups — a signup for four takes four places. Leave empty for no limit.',
                      sv: 'Hur många personer resan har plats för. Räknar personer, inte anmälningar — en anmälan för fyra tar fyra platser. Lämna tom för obegränsat.'
                    }
                  }
                },
                {
                  name: 'signupsClosed',
                  type: 'checkbox',
                  label: { en: 'Closed for signups', sv: 'Stängd för anmälan' },
                  defaultValue: false,
                  admin: {
                    width: '50%',
                    description: {
                      en: 'Stop taking new signups, including the waiting list. Signups already received are untouched.',
                      sv: 'Sluta ta emot nya anmälningar, även till väntelistan. Redan mottagna anmälningar påverkas inte.'
                    }
                  }
                }
              ]
            },
            {
              name: 'included',
              type: 'array',
              label: { en: "What's included", sv: 'Det här ingår' },
              labels: {
                singular: { en: 'Item', sv: 'Post' },
                plural: { en: 'Items', sv: 'Poster' }
              },
              admin: {
                description: {
                  en: 'One line per thing the price covers.',
                  sv: 'En rad per sak som priset täcker.'
                },
                disableListColumn: true,
                initCollapsed: false
              },
              fields: [
                {
                  name: 'item',
                  type: 'text',
                  label: false,
                  localized: true,
                  required: true
                }
              ]
            },
            {
              name: 'notIncluded',
              type: 'array',
              label: { en: 'Not included', sv: 'Ingår inte' },
              labels: {
                singular: { en: 'Item', sv: 'Post' },
                plural: { en: 'Items', sv: 'Poster' }
              },
              admin: {
                description: {
                  en: 'One line per thing customers pay for themselves.',
                  sv: 'En rad per sak som kunden betalar själv.'
                },
                disableListColumn: true,
                initCollapsed: false
              },
              fields: [
                {
                  name: 'item',
                  type: 'text',
                  label: false,
                  localized: true,
                  required: true
                }
              ]
            }
          ]
        },
        {
          label: { en: 'Itinerary', sv: 'Resplan' },
          fields: [
            {
              name: 'itinerary',
              type: 'array',
              interfaceName: 'TourItinerary',
              label: false,
              labels: {
                singular: { en: 'Day', sv: 'Dag' },
                plural: { en: 'Days', sv: 'Dagar' }
              },
              admin: {
                // The day number is the row position — reorder the rows to
                // renumber the days
                description: {
                  en: 'The day-by-day agenda. Add one entry per day of the tour, in order.',
                  sv: 'Dag-för-dag-schemat. Lägg till en post per resdag, i ordning.'
                },
                components: {
                  RowLabel:
                    '@codeware/apps/cms/components/TourItineraryRowLabel'
                },
                disableListColumn: true,
                initCollapsed: true
              },
              fields: [
                {
                  name: 'title',
                  type: 'text',
                  label: { en: 'Title', sv: 'Titel' },
                  localized: true,
                  required: true,
                  admin: {
                    description: {
                      en: 'What happens this day, e.g. "Arrival & welcome dinner".',
                      sv: 'Vad som händer denna dag, t.ex. "Ankomst & välkomstmiddag".'
                    }
                  }
                },
                {
                  name: 'places',
                  type: 'relationship',
                  relationTo: 'places',
                  label: { en: 'Places', sv: 'Platser' },
                  hasMany: true,
                  filterOptions: ({ req }) =>
                    filterByTenantScope(req, 'places'),
                  admin: {
                    description: {
                      en: 'Wineries, hotels and stops for this day.',
                      sv: 'Vingårdar, hotell och stopp för denna dag.'
                    }
                  }
                },
                {
                  name: 'description',
                  type: 'textarea',
                  label: { en: 'Description', sv: 'Beskrivning' },
                  localized: true,
                  admin: {
                    description: {
                      en: 'Plain text; line breaks are preserved.',
                      sv: 'Vanlig text; radbrytningar bevaras.'
                    }
                  }
                }
              ]
            }
          ]
        },
        {
          label: { en: 'Content', sv: 'Innehåll' },
          fields: [
            {
              name: 'content',
              type: 'richText',
              editor: lexicalEditor({
                features: ({ rootFeatures }) => [
                  ...rootFeatures,
                  BlocksFeature({
                    blocks: [...getActiveKeys<BlockSlug>(blocks)]
                  }),
                  multiTenantLinkFeature()
                ]
              }),
              label: false,
              localized: true,
              admin: {
                description: {
                  en: 'Everything that does not fit the structure above: preamble, practical info.',
                  sv: 'Allt som inte passar i strukturen ovan: ingress, praktisk information.'
                },
                disableListColumn: true,
                disableListFilter: true
              }
            }
          ]
        },
        // Auto-generate is off: it serializes form state, which still holds
        // the itinerary's rendered RowLabel and throws on the circular
        // reference. See `seoTab` for the detail.
        seoTab({ hasGenerateFn: false }),
        {
          label: { en: 'Tour signups', sv: 'Anmälningar' },
          description: {
            en: 'Who has signed up, and who is waiting. The same signups are listed under Tour signups, where you can search across every tour.',
            sv: 'Vilka som har anmält sig och vilka som står i kö. Samma anmälningar finns under Reseanmälningar, där du kan söka över alla resor.'
          },
          fields: [
            {
              name: 'tourSignups',
              type: 'ui',
              admin: {
                components: {
                  Field:
                    '@codeware/apps/cms/components/admin/tour-signups/TourSignupsField'
                }
              }
            }
          ]
        }
      ]
    },
    slugField({ sourceField: 'title', required: true }),
    // Capacity as the site needs it: derived on read by `populateTourCapacity`,
    // never stored. Virtual so no column exists to drift from the signups.
    {
      name: 'seatsTaken',
      type: 'number',
      virtual: true,
      admin: { hidden: true }
    },
    {
      name: 'seatsWaiting',
      type: 'number',
      virtual: true,
      admin: { hidden: true }
    },
    {
      name: 'seatsLeft',
      type: 'number',
      virtual: true,
      admin: { hidden: true }
    },
    {
      name: 'signupsFull',
      type: 'checkbox',
      virtual: true,
      admin: { hidden: true }
    },
    {
      // Seats may remain while the queue has first claim on them, and the site
      // has to offer the queue rather than a place it will not hand over
      name: 'signupsQueueOnly',
      type: 'checkbox',
      virtual: true,
      admin: { hidden: true }
    },
    {
      // List-only column: the totals are wanted when scanning tours, and a
      // virtual field would resolve them on every tour read instead
      name: 'signups',
      type: 'ui',
      label: { en: 'Signups', sv: 'Anmälningar' },
      admin: {
        components: {
          Cell: '@codeware/apps/cms/components/TourSignupsCell'
        }
      }
    }
  ],
  hooks: {
    afterOperation: [populateTourCapacity]
  },
  versions: {
    drafts: {
      autosave: {
        interval: 3000
      }
    }
  }
};

export default tours;
