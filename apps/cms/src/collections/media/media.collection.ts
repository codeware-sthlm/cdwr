import path from 'path';
import { fileURLToPath } from 'url';

import { tagsSelectField } from '@codeware/app-cms/ui/fields';
import { adminGroups, getMimeTypes } from '@codeware/app-cms/util/definitions';
import { getId } from '@codeware/app-cms/util/misc';
import { Media } from '@codeware/shared/util/payload-types';
import type {
  CollectionBeforeOperationHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  Condition,
  FieldHook,
  TypeWithID
} from 'payload';

import { userOnlyAccess } from '../../security/user-only-access';

import { externalOrApiKeyAccess } from './access/external-or-api-key-access';
import { ensureMimeType } from './ensure-mime-type';
import { imageUploadConfig } from './image-upload';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const isImage: Condition<TypeWithID, Media> = (_, siblingData) =>
  !!siblingData.mimeType && siblingData.mimeType.startsWith('image');

const filenameWithoutTenantPrefix: FieldHook<Media> = ({ siblingData }) => {
  const { filename, prefix } = siblingData ?? {};
  if (!filename || !prefix) return filename;
  const tenant = `${prefix}-`;
  return filename.startsWith(tenant) ? filename.slice(tenant.length) : filename;
};

const prefixFilenameWithTenant: CollectionBeforeOperationHook<
  'media'
> = async ({ args, operation }) => {
  if (operation !== 'create') return args;

  const { data, req } = args;
  const tenantId = getId(data?.tenant);
  if (!req.file || !tenantId) return args;

  try {
    const tenant = await req.payload.findByID({
      collection: 'tenants',
      id: tenantId,
      depth: 0,
      req
    });

    if (tenant?.slug) {
      // Prefix filename with tenant slug to ensure uniqueness across tenants.
      // Local: keeps re-seeds idempotent (no -2/-3 accumulation on disk).
      // S3: the file API endpoint resolves the S3 prefix by looking up the doc
      //     by filename alone — without unique filenames, cross-tenant requests
      //     return the wrong file.
      const filenamePrefix = `${tenant.slug}-`;
      if (!req.file.name.startsWith(filenamePrefix)) {
        req.file.name = `${filenamePrefix}${req.file.name}`;
      }
      if (data?.filename && !data.filename.startsWith(filenamePrefix)) {
        data.filename = `${filenamePrefix}${data.filename}`;
      }

      // S3: store tenant slug as prefix so files land in tenant folders
      // e.g. star/star-abstract-image-1.jpg
      data.prefix = tenant.slug;
    }
  } catch {
    // Non-fatal: proceed without prefix if tenant lookup fails
  }

  return args;
};

/**
 * Media collection for files with supported mime types.
 *
 * Uploaded images are converted to webp format.
 *
 * **Mime types**
 *
 * `@codeware/app-cms/util/definitions`
 */
const media: CollectionConfig = {
  slug: 'media',
  admin: {
    group: adminGroups.fileArea,
    useAsTitle: 'filenameWithoutPrefix',
    defaultColumns: [
      'filename',
      'filenameWithoutPrefix',
      'mimeType',
      'fileSize',
      'tags',
      'createdAt'
    ],
    description: {
      en: 'Upload media files to the system and use them on your website. Images are converted to webp format for better performance.',
      sv: 'Ladda upp bilder eller andra filer till arbetsytan och använd dem på din webbplats. Bilder konverteras till webp-format för bättre prestanda.'
    },
    components: {
      beforeListTable: [
        {
          path: '@codeware/app-cms/ui/components/Callout',
          serverProps: {
            kind: 'tip',
            titleKey: 'media:calloutTitle',
            descriptionKey: 'media:calloutDescriptions'
          }
        }
      ]
    }
  },
  access: {
    read: externalOrApiKeyAccess(),
    create: userOnlyAccess(),
    update: userOnlyAccess(),
    delete: userOnlyAccess()
  },
  hooks: {
    beforeOperation: [prefixFilenameWithTenant],
    beforeValidate: [ensureMimeType]
  },
  labels: {
    singular: { en: 'Media', sv: 'Media' },
    plural: { en: 'Media', sv: 'Media' }
  },
  indexes: [{ fields: ['filename', 'prefix'], unique: true }],
  upload: {
    ...imageUploadConfig,
    mimeTypes: getMimeTypes(),
    filenameCompoundIndex: ['filename', 'prefix'],
    // Local storage will be disabled when S3 storage is configured.
    // Upload to the public/media directory in Next.js making them publicly accessible even outside of Payload.
    staticDir: path.resolve(dirname, '../../../public/media')
  },
  fields: [
    {
      // Stores the filename without the tenant prefix for display in the admin UI.
      // Computed from filename + prefix on every write; never edited directly.
      name: 'filenameWithoutPrefix',
      type: 'text',
      label: { en: 'Filename', sv: 'Filnamn' },
      admin: { hidden: true },
      hooks: {
        beforeChange: [filenameWithoutTenantPrefix]
      }
    },
    {
      name: 'alt',
      type: 'text',
      admin: {
        description: {
          en: 'Alternative text for SEO and accessibility.',
          sv: 'Alternativ text för SEO och tillgänglighet.'
        }
      },
      required: true
    },
    {
      name: 'caption',
      type: 'richText',
      localized: true,
      admin: {
        condition: isImage,
        description: {
          en: 'Caption to display below an image.',
          sv: 'Text som visas under en bild.'
        }
      }
    },
    tagsSelectField({
      buildIndex: true,
      overrides: {
        // TODO: Would like to use 'drawer' but it doesn't work with bulk upload media.
        // Better to be safe and wait for a fix.
        admin: { appearance: 'select' }
      }
    }),
    {
      // Stores the tenant slug for S3 storage — used by the cloud storage plugin
      // to build the S3 key: {prefix}/{filename} (e.g. star/star-abstract-image-1.jpg).
      // Set automatically by the beforeOperation hook; not shown in admin UI.
      // afterRead: coerce null → undefined so the S3 delete handler's `{ prefix = '' }`
      // default kicks in for records created before this hook existed.
      name: 'prefix',
      type: 'text',
      admin: { hidden: true },
      hooks: {
        afterRead: [({ value }) => value ?? undefined]
      }
    },
    {
      // Media files are not fetched, hence there's no api key to verify.
      // This property will be used as alternative access control for static file requests.
      name: 'external',
      type: 'checkbox',
      label: { en: 'External access', sv: 'Extern åtkomst' },
      admin: {
        description: {
          en: 'Allow external access to the file without authentication. For example, this is required for file areas and document images.',
          sv: 'Tillåt extern åtkomst till filen utan autentisering. Detta krävs till exempel för filytor och bilder i dokument.'
        },
        position: 'sidebar'
      },
      defaultValue: false
    }
  ]
};

export default media;
