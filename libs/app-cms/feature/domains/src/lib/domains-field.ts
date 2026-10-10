import { deepMerge } from '@codeware/shared/util/pure';
import type { ArrayField } from 'payload';

import { validateHostname } from './validate-hostname';

type Props = {
  /** Override field configuration with selected properties */
  override?: Partial<ArrayField>;
};

/**
 * Custom domains field configuration for Payload CMS.
 *
 * An array of hostnames, the Fly app serving each, which one is primary, and
 * the certificate state Fly last reported. Shared between the tenants
 * collection and platform settings — both adopt from it via `adoptableDomains`,
 * which is app-scoped rather than tenant-scoped.
 *
 * The field configuration can be overridden by providing a partial
 * configuration, that will be deep merged with the default configuration.
 *
 * Lives here rather than in `ui/fields`: `validateHostname` is `type:feature`,
 * and `type:ui` libs may only depend on `type:ui`/`type:util`.
 */
export const domainsField = ({ override }: Props = {}): ArrayField => {
  const field = deepMerge<ArrayField>(
    {
      name: 'domains',
      type: 'array',
      label: { en: 'Custom domains', sv: 'Egna domäner' },
      admin: {
        disableListColumn: true,
        description: {
          en: 'Domains this workspace is reachable on, in addition to its .fly.dev address — which keeps working and stays useful for support. Add the domain here first, then create the DNS records shown after saving.',
          sv: 'Domäner som arbetsytan nås på, utöver dess .fly.dev-adress — som fortsätter fungera och är bra att ha vid support. Lägg till domänen här först och skapa sedan DNS-posterna som visas efter att du sparat.'
        },
        initCollapsed: true
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'hostname',
              type: 'text',
              label: { en: 'Domain', sv: 'Domän' },
              required: true,
              validate: validateHostname,
              admin: {
                width: '60%',
                placeholder: 'tours.example.com',
                description: {
                  en: 'The domain on its own — no https://, no path.',
                  sv: 'Enbart domänen — utan https:// och utan sökväg.'
                }
              }
            },
            {
              name: 'app',
              type: 'text',
              label: { en: 'Fly app', sv: 'Fly-app' },
              required: true,
              admin: {
                width: '40%',
                placeholder: 'cdwr-web-moon',
                description: {
                  en: 'The Fly app that serves this domain. The certificate is attached to it.',
                  sv: 'Fly-appen som servar domänen. Certifikatet kopplas till den.'
                }
              }
            }
          ]
        },
        {
          name: 'isPrimary',
          type: 'checkbox',
          label: { en: 'Primary domain', sv: 'Primär domän' },
          admin: {
            description: {
              en: 'The address the app presents as its own, in links and emails. One per app.',
              sv: 'Adressen appen anger som sin egen, i länkar och e-post. En per app.'
            }
          }
        },
        {
          // What Fly last said about this domain. Field names are Fly's own, so
          // a stored value can be read straight against its schema. The one
          // exception is `addresses`, already turned into the records to create.
          //
          // Hidden rather than rendered: eight read-only inputs per row would
          // bury the two fields that are actually filled in. The panel below
          // the array presents the same data as something to act on.
          type: 'group',
          name: 'certificate',
          admin: { hidden: true },
          fields: [
            { name: 'isConfigured', type: 'checkbox' },
            { name: 'isApex', type: 'checkbox' },
            { name: 'status', type: 'text' },
            { name: 'checkedAt', type: 'date' },
            { name: 'dnsValidationHostname', type: 'text' },
            { name: 'dnsValidationTarget', type: 'text' },
            { name: 'dnsValidationInstructions', type: 'textarea' },
            { name: 'rateLimitedUntil', type: 'date' },
            { name: 'validationErrors', type: 'text', hasMany: true },
            { name: 'certificateAuthority', type: 'text' },
            {
              // Stored rather than fetched on demand, for the same reason as
              // everything else here: the panel renders without calling Fly,
              // so an expiry only held in a response would vanish on reload
              name: 'issuedCertificates',
              type: 'array',
              fields: [
                { name: 'type', type: 'text' },
                { name: 'expiresAt', type: 'date' }
              ]
            },
            {
              // The A and AAAA records an apex points at, mapped from the app's
              // addresses: an apex cannot use the CNAME a subdomain does
              name: 'addresses',
              type: 'array',
              fields: [
                {
                  name: 'type',
                  type: 'select',
                  options: [
                    { label: 'A', value: 'A' },
                    { label: 'AAAA', value: 'AAAA' }
                  ]
                },
                { name: 'address', type: 'text' }
              ]
            }
          ]
        }
      ]
    },
    override ?? {}
  );

  return field;
};
