// This file is custom generated and should not be edited unless necessary.

import { faqData } from './faq-data';
import { readStockMediaFiles } from './read-media-files';

const tenantSlug = {
  cdwrIo: 'cdwr-io',
  codeware: 'codeware',
  moon: 'moon',
  star: 'star'
} as const;

const tenants = {
  cdwrIo: { apiKey: '9d5316b1-0298-4113-904c-6cc10fcacb6c' },
  codeware: { apiKey: '81a86960-43e4-4e7d-ab4f-166c5c168183' },
  moon: { apiKey: 'b9c2fb25-df77-4304-a60a-028779a2cb37' },
  star: { apiKey: 'a76d0168-f9b2-48d2-bc57-96e45aaf8542' }
} as const;

// Extract the record values, which are the final string representations of the tenant slugs.
export type TenantSlug = (typeof tenantSlug)[keyof typeof tenantSlug];

/**
 * Seed data for **DEVELOPMENT** environment.
 *
 * @param remoteDataUrl Optionally read remote media files from a URL, otherwise read local media files.
 * @returns Base seed data for the application.
 */
export const seedData = (remoteDataUrl: string | undefined) => {
  const stockFiles = Object.fromEntries(
    readStockMediaFiles(remoteDataUrl).map(({ filePath, filename }) => [
      filename,
      filePath
    ])
  );

  return {
    faq: faqData(),
    stockMedia: [
      {
        alt: 'A vineyard hut among green vines above a wide plain',
        subject: 'vineyard hut',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-hut-1.jpg',
        filePath: stockFiles['stock-hut-1.jpg']
      },
      {
        alt: 'A stone vineyard hut on a slope under soft overcast light',
        subject: 'vineyard hut',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-hut-2.jpg',
        filePath: stockFiles['stock-hut-2.jpg']
      },
      {
        alt: 'A river loop below vineyard slopes, village on the bend',
        subject: 'river valley',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-rivervalley-1.jpg',
        filePath: stockFiles['stock-rivervalley-1.jpg']
      },
      {
        alt: 'A river loop seen over a dry stone wall from the vineyards',
        subject: 'river valley',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-rivervalley-2.jpg',
        filePath: stockFiles['stock-rivervalley-2.jpg']
      },
      {
        alt: 'Rolling vineyard country framed by vine leaves',
        subject: 'rolling hills',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-rollinghills-2.jpg',
        filePath: stockFiles['stock-rollinghills-2.jpg']
      },
      {
        alt: 'Steep terraced vineyards above a valley town',
        subject: 'terraces',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-terraces-1.jpg',
        filePath: stockFiles['stock-terraces-1.jpg']
      },
      {
        alt: 'Terraced vineyard slopes under a pale overcast sky',
        subject: 'terraces',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-terraces-2.jpg',
        filePath: stockFiles['stock-terraces-2.jpg']
      },
      {
        alt: 'Layered vineyard terraces rising up a valley side',
        subject: 'terraces',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-terraces-3.jpg',
        filePath: stockFiles['stock-terraces-3.jpg']
      },
      {
        alt: 'A wine village with a church spire below green slopes',
        subject: 'village',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-village-1.jpg',
        filePath: stockFiles['stock-village-1.jpg']
      },
      {
        alt: 'Red tiled roofs of a wine village seen through vine leaves',
        subject: 'village',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-village-2.jpg',
        filePath: stockFiles['stock-village-2.jpg']
      },
      {
        alt: 'A village church spire above the vineyards',
        subject: 'village',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-village-3.jpg',
        filePath: stockFiles['stock-village-3.jpg']
      },
      {
        alt: 'Trellised vine rows running toward distant hills',
        subject: 'vine rows',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-vinerows-1.jpg',
        filePath: stockFiles['stock-vinerows-1.jpg']
      },
      {
        alt: 'Vine rows behind a dry stone wall on a hillside',
        subject: 'vine rows',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-vinerows-2.jpg',
        filePath: stockFiles['stock-vinerows-2.jpg']
      }
    ],
    places: [
      {
        name: 'Tranquility Base Camp',
        kind: 'hotel',
        url: 'https://example.com/tranquility-base-camp',
        note: 'Eight cabins around a shared observation dome.',
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        name: 'Hypatia Rille Station',
        kind: 'activity',
        url: 'https://example.com/hypatia-rille',
        note: 'Field geology outpost on the eastern rille.',
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        name: 'Shackleton Ice Lab',
        kind: 'activity',
        url: 'https://example.com/shackleton-ice-lab',
        note: 'Working survey lab on the crater floor.',
        tenant: { lookupApiKey: tenants.moon.apiKey }
      }
    ],
    tenants: [
      {
        name: 'cdwr.io',
        slug: tenantSlug.cdwrIo,
        description: 'cdwr platform showcase.',
        locale: 'en',
        supportedLocales: ['en'],
        apiKey: tenants.cdwrIo.apiKey
      },
      {
        name: 'codeware.se',
        slug: tenantSlug.codeware,
        // Matches `TENANT_ID=codeware`, the id it has in Infisical and production
        deployment: 'codeware',
        description:
          'Konsultverksamheten — systemutveckling och teknisk ledning',
        locale: 'sv',
        supportedLocales: ['sv'],
        apiKey: tenants.codeware.apiKey
      },
      {
        name: 'Moon',
        slug: tenantSlug.moon,
        // Matches `TENANT_ID=moon`, which development runs tenant mode as
        deployment: 'moon',
        description:
          'A moon is a natural satellite that orbits a planet or other celestial body larger than itself.',
        locale: 'en',
        supportedLocales: ['en', 'sv'],
        apiKey: tenants.moon.apiKey
      },
      {
        name: 'Star',
        slug: tenantSlug.star,
        description:
          'A star is a luminous spherical celestial body composed primarily of hydrogen and helium gas that generates energy through nuclear fusion in its core.',
        locale: 'en',
        supportedLocales: ['en'],
        apiKey: tenants.star.apiKey
      }
    ],
    tours: [
      {
        title: 'Sea of Tranquility Expedition',
        slug: 'sea-of-tranquility-expedition',
        summary:
          'Seven days along the Apollo 11 landing site, from the first bootprint to the far side sunrise.',
        destination: 'Mare Tranquillitatis, Moon',
        duration: '7 days',
        price: 2400,
        currency: 'EUR',
        departureDate: '2027-04-12',
        bookingDeadline: '2027-02-12',
        heroImage: 'stock-rivervalley-1.jpg',
        intent: 'booking' as const,
        included: [
          'All transfers from the orbital station',
          'Seven nights at base camp, full board',
          'Suit rental',
          'Certified guide throughout'
        ],
        notIncluded: ['Orbital transfer from Earth', 'Personal insurance'],
        itinerary: [
          {
            places: ['Tranquility Base Camp'],
            title: 'Arrival & welcome dinner',
            description:
              'Landing at the base camp, gear check and a first look at the mare through the observation dome.'
          },
          {
            title: 'The landing site',
            description:
              'A slow walk to the Apollo 11 site, keeping the safe distance the preservation rules require.'
          },
          {
            places: ['Hypatia Rille Station'],
            title: 'Regolith and rilles',
            description:
              'Field geology along Hypatia Rille with a guide who has spent a decade mapping it.'
          },
          {
            title: 'Earthrise',
            description:
              'An early start for the full Earth over the eastern rim, followed by a long breakfast.'
          },
          {
            title: 'Free day',
            description:
              'Rest, read, or join the optional traverse to the neighbouring crater field.'
          },
          {
            title: 'Far side crossing',
            description:
              'The quiet side, radio silence and the darkest sky any of us will ever stand under.'
          },
          {
            title: 'Departure',
            description: 'Final briefing, group photo and the ride home.'
          }
        ],
        content:
          "## What's included\nAll transfers from the orbital station, seven nights at base camp, full board, suit rental and a certified guide throughout.\n\n## Good to know\nGroups are capped at eight travellers. A basic fitness check is required no later than four weeks before departure.\n",
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        title: 'Lunar South Pole Ice Walk',
        slug: 'lunar-south-pole-ice-walk',
        summary:
          'Four days in permanent shadow, hunting water ice with the team that found it.',
        destination: 'Shackleton Crater, Moon',
        duration: '4 days',
        price: 1800,
        currency: 'EUR',
        departureNote: 'Summer 2027 — dates to be confirmed',
        heroImage: 'stock-terraces-1.jpg',
        intent: 'interest' as const,
        included: [
          'Four nights, all meals',
          'Thermal suit rental',
          'Lab access with the survey team'
        ],
        notIncluded: ['Orbital transfer from Earth', 'Personal insurance'],
        itinerary: [
          {
            title: 'Into the shadow',
            description:
              'Descent to the crater floor and an introduction to cold-trap science.'
          },
          {
            places: ['Shackleton Ice Lab'],
            title: 'Sampling day',
            description:
              'Hands-on coring alongside the survey team, with lab time in the afternoon.'
          },
          {
            title: 'Peak of eternal light',
            description:
              'Up to the rim where the sun never quite sets, and the solar array that powers it all.'
          },
          {
            title: 'Departure',
            description: 'A last look down into the dark, then home.'
          }
        ],
        content:
          "## What's included\nFour nights, all meals, thermal suit rental and every instrument you will get your hands on.\n\n## Good to know\nTemperatures on the crater floor stay below -150°C. The walking is easy but the cold is not.\n",
        tenant: { lookupApiKey: tenants.moon.apiKey }
      }
    ],
    users: [
      {
        name: 'System User',
        description: 'Access to manage the whole system',
        email: 'system@local.dev',
        password: '',
        role: 'system-user',
        locale: 'en',
        tenants: []
      },
      {
        name: 'Black Hole',
        description: 'Admin access to all workspaces',
        email: 'black@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [
          {
            lookupApiKey: tenants.star.apiKey,
            role: 'admin'
          },
          {
            lookupApiKey: tenants.moon.apiKey,
            role: 'admin'
          }
        ]
      },
      {
        name: 'Space Station',
        description: 'User access to all workspaces',
        email: 'iss@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [
          {
            lookupApiKey: tenants.star.apiKey,
            role: 'user'
          },
          {
            lookupApiKey: tenants.moon.apiKey,
            role: 'user'
          }
        ]
      },
      {
        name: 'Antares Star',
        description: 'Administrator access to Star',
        email: 'antares@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [
          {
            lookupApiKey: tenants.star.apiKey,
            role: 'admin'
          }
        ]
      },
      {
        name: 'Vega Star',
        description: 'User access to Star',
        email: 'vega@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [{ lookupApiKey: tenants.star.apiKey, role: 'user' }]
      },
      {
        name: 'Titan Moon',
        description: 'Administrator access to Moon',
        email: 'titan@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [
          {
            lookupApiKey: tenants.moon.apiKey,
            role: 'admin'
          }
        ]
      },
      {
        name: 'Luna Moon',
        description: 'Reads members-only content on Moon, no admin access',
        email: 'luna@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [
          { lookupApiKey: tenants.moon.apiKey, role: 'reader' as const }
        ]
      },
      {
        name: 'Phobos Moon',
        description: 'User access to Moon',
        email: 'phobos@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [{ lookupApiKey: tenants.moon.apiKey, role: 'user' }]
      }
    ]
  };
};
