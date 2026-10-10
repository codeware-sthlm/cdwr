import type { PlatformDefinition } from '../platform-definition';

import { faq } from './faq';

/**
 * The platform: its tenants, their users, the shared vocabularies editors
 * pick labels from, the stock photo library and the FAQ.
 *
 * One dataset for both development and preview — `seed()` applies it with
 * `applyPlatformDefinition`, then applies each tenant's own site definition.
 */
export const platform = {
  labels: [
    { type: 'stock-subject', name: 'vineyard hut', icon: 'PhotoIcon' },
    { type: 'stock-subject', name: 'river valley', icon: 'PhotoIcon' },
    { type: 'stock-subject', name: 'rolling hills', icon: 'PhotoIcon' },
    { type: 'stock-subject', name: 'terraces', icon: 'PhotoIcon' },
    { type: 'stock-subject', name: 'village', icon: 'PhotoIcon' },
    { type: 'stock-subject', name: 'vine rows', icon: 'PhotoIcon' },
    { type: 'place-kind', name: 'hotel', icon: 'HomeModernIcon' },
    { type: 'place-kind', name: 'activity', icon: 'MapIcon' }
  ],

  stockMedia: [
    {
      filename: 'stock-hut-1.jpg',
      alt: 'A vineyard hut among green vines above a wide plain',
      subject: 'vineyard hut',
      credit: 'FLUX 1.1 pro ultra via Replicate',
      licence: 'AI generated — commercial use permitted'
    },
    {
      filename: 'stock-hut-2.jpg',
      alt: 'A stone vineyard hut on a slope under soft overcast light',
      subject: 'vineyard hut',
      credit: 'FLUX 1.1 pro ultra via Replicate',
      licence: 'AI generated — commercial use permitted'
    },
    {
      filename: 'stock-rivervalley-1.jpg',
      alt: 'A river loop below vineyard slopes, village on the bend',
      subject: 'river valley',
      credit: 'FLUX 1.1 pro ultra via Replicate',
      licence: 'AI generated — commercial use permitted'
    },
    {
      filename: 'stock-rivervalley-2.jpg',
      alt: 'A river loop seen over a dry stone wall from the vineyards',
      subject: 'river valley',
      credit: 'FLUX 1.1 pro ultra via Replicate',
      licence: 'AI generated — commercial use permitted'
    },
    {
      filename: 'stock-rollinghills-2.jpg',
      alt: 'Rolling vineyard country framed by vine leaves',
      subject: 'rolling hills',
      credit: 'FLUX 1.1 pro ultra via Replicate',
      licence: 'AI generated — commercial use permitted'
    },
    {
      filename: 'stock-terraces-1.jpg',
      alt: 'Steep terraced vineyards above a valley town',
      subject: 'terraces',
      credit: 'FLUX 1.1 pro ultra via Replicate',
      licence: 'AI generated — commercial use permitted'
    },
    {
      filename: 'stock-terraces-2.jpg',
      alt: 'Terraced vineyard slopes under a pale overcast sky',
      subject: 'terraces',
      credit: 'FLUX 1.1 pro ultra via Replicate',
      licence: 'AI generated — commercial use permitted'
    },
    {
      filename: 'stock-terraces-3.jpg',
      alt: 'Layered vineyard terraces rising up a valley side',
      subject: 'terraces',
      credit: 'FLUX 1.1 pro ultra via Replicate',
      licence: 'AI generated — commercial use permitted'
    },
    {
      filename: 'stock-village-1.jpg',
      alt: 'A wine village with a church spire below green slopes',
      subject: 'village',
      credit: 'FLUX 1.1 pro ultra via Replicate',
      licence: 'AI generated — commercial use permitted'
    },
    {
      filename: 'stock-village-2.jpg',
      alt: 'Red tiled roofs of a wine village seen through vine leaves',
      subject: 'village',
      credit: 'FLUX 1.1 pro ultra via Replicate',
      licence: 'AI generated — commercial use permitted'
    },
    {
      filename: 'stock-village-3.jpg',
      alt: 'A village church spire above the vineyards',
      subject: 'village',
      credit: 'FLUX 1.1 pro ultra via Replicate',
      licence: 'AI generated — commercial use permitted'
    },
    {
      filename: 'stock-vinerows-1.jpg',
      alt: 'Trellised vine rows running toward distant hills',
      subject: 'vine rows',
      credit: 'FLUX 1.1 pro ultra via Replicate',
      licence: 'AI generated — commercial use permitted'
    },
    {
      filename: 'stock-vinerows-2.jpg',
      alt: 'Vine rows behind a dry stone wall on a hillside',
      subject: 'vine rows',
      credit: 'FLUX 1.1 pro ultra via Replicate',
      licence: 'AI generated — commercial use permitted'
    }
  ],

  faq,

  tenants: [
    {
      name: 'cdwr.io',
      slug: 'cdwr-io',
      // Matches its Infisical folder and the `cdwr-cms-cdwr-io` Fly app
      deployment: 'cdwr-io',
      apiKey: '9d5316b1-0298-4113-904c-6cc10fcacb6c',
      description: 'cdwr platform showcase.',
      locale: 'en',
      supportedLocales: ['en']
    },
    {
      name: 'codeware.se',
      slug: 'codeware',
      // Matches `TENANT_ID=codeware`, the id it has in Infisical and production
      deployment: 'codeware',
      apiKey: '81a86960-43e4-4e7d-ab4f-166c5c168183',
      description: 'Konsultverksamheten — systemutveckling och teknisk ledning',
      locale: 'sv',
      supportedLocales: ['sv']
    },
    {
      name: 'Moon',
      slug: 'moon',
      // Matches `TENANT_ID=moon`, which development runs tenant mode as
      deployment: 'moon',
      apiKey: 'b9c2fb25-df77-4304-a60a-028779a2cb37',
      description:
        'A moon is a natural satellite that orbits a planet or other celestial body larger than itself.',
      locale: 'en',
      supportedLocales: ['en', 'sv']
    },
    {
      name: 'Star',
      slug: 'star',
      apiKey: 'a76d0168-f9b2-48d2-bc57-96e45aaf8542',
      description:
        'A star is a luminous spherical celestial body composed primarily of hydrogen and helium gas that generates energy through nuclear fusion in its core.',
      locale: 'en',
      supportedLocales: ['en']
    }
  ],

  users: [
    {
      name: 'System User',
      description: 'Access to manage the whole system',
      email: 'system@local.dev',
      role: 'system-user',
      locale: 'en',
      tenants: []
    },
    {
      name: 'Black Hole',
      description: 'Admin access to all workspaces',
      email: 'black@local.dev',
      role: 'user',
      locale: 'en',
      tenants: [
        { lookupSlug: 'star', role: 'admin' },
        { lookupSlug: 'moon', role: 'admin' }
      ]
    },
    {
      name: 'Space Station',
      description: 'User access to all workspaces',
      email: 'iss@local.dev',
      role: 'user',
      locale: 'en',
      tenants: [
        { lookupSlug: 'star', role: 'user' },
        { lookupSlug: 'moon', role: 'user' }
      ]
    },
    {
      name: 'Antares Star',
      description: 'Administrator access to Star',
      email: 'antares@local.dev',
      role: 'user',
      locale: 'en',
      tenants: [{ lookupSlug: 'star', role: 'admin' }]
    },
    {
      name: 'Vega Star',
      description: 'User access to Star',
      email: 'vega@local.dev',
      role: 'user',
      locale: 'en',
      tenants: [{ lookupSlug: 'star', role: 'user' }]
    },
    {
      name: 'Titan Moon',
      description: 'Administrator access to Moon, writes its custom components',
      email: 'titan@local.dev',
      role: 'user',
      locale: 'en',
      tenants: [{ lookupSlug: 'moon', role: 'admin', componentDeveloper: true }]
    },
    {
      name: 'Luna Moon',
      description: 'Reads members-only content on Moon, no admin access',
      email: 'luna@local.dev',
      role: 'user',
      locale: 'en',
      tenants: [{ lookupSlug: 'moon', role: 'reader' }]
    },
    {
      name: 'Phobos Moon',
      description: 'User access to Moon',
      email: 'phobos@local.dev',
      role: 'user',
      locale: 'en',
      tenants: [{ lookupSlug: 'moon', role: 'user' }]
    }
  ]
} as const satisfies PlatformDefinition;

/** A tenant slug the platform states. */
export type PlatformTenantSlug = (typeof platform)['tenants'][number]['slug'];
