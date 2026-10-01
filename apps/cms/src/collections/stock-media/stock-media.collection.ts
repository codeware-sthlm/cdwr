import path from 'path';
import { fileURLToPath } from 'url';

import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  authenticatedAccess,
  systemUserAccess
} from '@codeware/app-cms/util/access';
import { adminGroups, getMimeTypes } from '@codeware/app-cms/util/definitions';
import { hasRole } from '@codeware/app-cms/util/misc';
import type { Access, CollectionConfig } from 'payload';

import { ensureMimeType } from '../media/ensure-mime-type';
import { imageUploadConfig } from '../media/image-upload';
import { platformLabelField } from '../platform-labels/platform-label.field';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

/**
 * Stock media is public by nature — the files end up on public tour pages, so an
 * unauthenticated browser must be able to fetch them. Document queries still
 * require an authenticated identity (editor or tenant api key).
 *
 * Deliberately not `userOrApiKeyAccess`: that returns a `tenant` constraint for
 * tenant-enabled collections, and this library has no tenant field — Payload
 * would reject the query with "Cannot find field for path at tenant".
 */
const publicFileAccess: Access = (args) =>
  args.isReadingStaticFile ? true : authenticatedAccess(args);

/**
 * Stock media collection.
 *
 * A platform-owned library shared by every tenant, curated by system users.
 * Deliberately *not* registered with the multi-tenant plugin — one physical
 * copy is offered to all tenants rather than duplicated per workspace.
 *
 * Intended for atmosphere: a landscape, a cellar, a table set for dinner. A
 * tenant that needs an image of a specific, named place is expected to upload
 * their own into `media` instead.
 */
const stockMedia: CollectionConfig<'stock-media'> = {
  slug: 'stock-media',
  admin: {
    group: adminGroups.fileArea,
    useAsTitle: 'alt',
    defaultColumns: ['alt', 'subject', 'filename', 'createdAt'],
    description: {
      en: 'Shared images provided by the platform, free for any workspace to use. Upload your own photos under Media when you need a specific place.',
      sv: 'Delade bilder som plattformen tillhandahåller, fria att använda i alla arbetsytor. Ladda upp egna bilder under Media när du behöver en specifik plats.'
    },
    // Hidden from editors who cannot manage it; they reach the library through
    // the image picker on the fields that use it
    hidden: ({ user }) => !hasRole(user, 'system-user')
  },
  access: {
    read: publicFileAccess,
    create: systemUserAccess,
    update: systemUserAccess,
    delete: systemUserAccess
  },
  hooks: {
    beforeValidate: [ensureMimeType]
  },
  labels: {
    singular: { en: 'Stock image', sv: 'Delad bild' },
    plural: { en: 'Stock images', sv: 'Delade bilder' }
  },
  upload: {
    ...imageUploadConfig,
    mimeTypes: getMimeTypes({ limit: ['image'] }),
    // Files land in a single shared folder rather than a tenant one
    staticDir: path.resolve(
      dirname,
      '../../..',
      getEnv().MEDIA_DIR,
      'stock-media'
    )
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      label: { en: 'Description', sv: 'Beskrivning' },
      required: true,
      admin: {
        description: {
          en: 'Alternative text for SEO and accessibility. Describe what the image shows.',
          sv: 'Alternativ text för SEO och tillgänglighet. Beskriv vad bilden visar.'
        }
      }
    },
    platformLabelField({
      name: 'subject',
      labelType: 'stock-subject',
      overrides: {
        label: { en: 'Subject', sv: 'Motiv' },
        admin: {
          description: {
            en: 'What the image shows. The list is curated by the platform.',
            sv: 'Vad bilden visar. Listan sköts av plattformen.'
          }
        }
      }
    }),
    {
      // Stores the S3 key prefix so files land in their own folder rather than
      // beside the tenant folders at the bucket root.
      //
      // Deliberately a real field with a fixed default rather than the storage
      // plugin's `prefix` option: the plugin only runs when a bucket is
      // configured, so its field would exist in some environments and not
      // others and no migration could describe both.
      name: 'prefix',
      type: 'text',
      defaultValue: 'stock-media',
      admin: { hidden: true },
      hooks: {
        // Coerce null → undefined so the S3 delete handler's `{ prefix = '' }`
        // default applies to rows created before this field existed
        afterRead: [({ value }) => value ?? undefined]
      }
    },
    {
      name: 'credit',
      type: 'text',
      label: { en: 'Credit', sv: 'Fotograf' },
      admin: {
        description: {
          en: 'Photographer or source, where the licence requires attribution.',
          sv: 'Fotograf eller källa, när licensen kräver att den anges.'
        },
        position: 'sidebar'
      }
    },
    {
      name: 'licence',
      type: 'text',
      label: { en: 'Licence', sv: 'Licens' },
      admin: {
        description: {
          en: 'The licence this image is used under, so its terms can be checked later.',
          sv: 'Licensen bilden används under, så villkoren kan kontrolleras senare.'
        },
        position: 'sidebar'
      }
    }
  ]
};

export default stockMedia;
