import {
  domainsField,
  guardDomainConflicts,
  normalizeDomains
} from '@codeware/app-cms/feature/domains';
import {
  authenticatedAccess,
  systemUserAccess
} from '@codeware/app-cms/util/access';
import { adminGroups } from '@codeware/app-cms/util/definitions';
import { hasRole } from '@codeware/app-cms/util/misc';
import type { CollectionConfig } from 'payload';

import { ensureSingleRow } from './hooks/ensure-single-row';

/**
 * Platform settings collection.
 *
 * One row, for non-secret configuration the platform itself needs — as
 * opposed to a workspace. Kept apart from Infisical/env because this class of
 * value has no reason to be a secret, benefits from Payload's validation and
 * version history, and is edited far more often than a deployment's env is
 * redeployed.
 *
 * Platform-owned, so deliberately not registered with the multi-tenant plugin,
 * and kept to a single document by `ensureSingleRow` rather than Payload's
 * `isGlobal` — that flag belongs to the plugin's per-tenant globals, and this
 * collection carries no `tenant` field for the plugin to key on.
 */
const platformSettings: CollectionConfig<'platform-settings'> = {
  slug: 'platform-settings',
  admin: {
    group: adminGroups.settings,
    components: {
      views: {
        // One row, so the list only ever delays the edit view
        list: {
          Component:
            '@codeware/apps/cms/components/admin/single-doc/SingleDocListView'
        }
      }
    },
    description: {
      en: "Non-secret configuration the platform needs once its database is reachable — such as the host application's own custom domain.",
      sv: 'Icke-hemlig konfiguration som plattformen behöver när dess databas är nåbar — till exempel värdapplikationens egen anpassade domän.'
    },
    // Editors meet these effects without ever seeing the collection
    hidden: ({ user }) => !hasRole(user, 'system-user')
  },
  access: {
    read: authenticatedAccess,
    create: systemUserAccess,
    update: systemUserAccess,
    delete: systemUserAccess
  },
  labels: {
    singular: { en: 'Platform Settings', sv: 'Plattformsinställningar' },
    plural: { en: 'Platform Settings', sv: 'Plattformsinställningar' }
  },
  hooks: {
    beforeValidate: [normalizeDomains, ensureSingleRow],
    beforeChange: [guardDomainConflicts]
  },
  fields: [
    {
      name: 'signupOpen',
      type: 'checkbox',
      defaultValue: false,
      label: { en: 'Signup open', sv: 'Registrering öppen' },
      admin: {
        description: {
          en: 'Self-serve signup accepts invite codes.',
          sv: 'Egen registrering tar emot inbjudningskoder.'
        }
      }
    },
    {
      name: 'signupNotifyEmail',
      type: 'email',
      label: {
        en: 'Signup notice email',
        sv: 'E-post för registreringsavisering'
      },
      admin: {
        description: {
          en: 'Gets a short notice for each self-serve signup; empty means the signup is only logged.',
          sv: 'Får en kort avisering för varje egen registrering; tomt betyder att registreringen bara loggas.'
        }
      }
    },
    {
      name: 'idleWorkspaceDays',
      type: 'number',
      min: 7,
      label: {
        en: 'Delete idle workspaces after (days)',
        sv: 'Ta bort oanvända arbetsytor efter (dagar)'
      },
      admin: {
        step: 1,
        description: {
          en: 'Self-serve workspaces that still have no page this many days after signup are deleted, after a warning to their admins a week before. Leave empty to turn the cleanup off.',
          sv: 'Arbetsytor från egen registrering som fortfarande saknar sidor så här många dagar efter registreringen tas bort, efter en varning till deras administratörer en vecka innan. Lämna tomt för att stänga av städningen.'
        }
      }
    },
    domainsField({
      override: {
        admin: {
          disableListColumn: true,
          description: {
            en: 'Domains the host application is reachable on, in addition to its .fly.dev address — which keeps working and stays useful for support. Add the domain here first, then create the DNS records shown after saving. Takes effect after a restart.',
            sv: 'Domäner som värdapplikationen nås på, utöver dess .fly.dev-adress — som fortsätter fungera och är bra att ha vid support. Lägg till domänen här först och skapa sedan DNS-posterna som visas efter att du sparat. Börjar gälla efter en omstart.'
          },
          initCollapsed: true
        }
      }
    }),
    {
      name: 'domainsPanel',
      type: 'ui',
      admin: {
        components: {
          Field:
            '@codeware/apps/cms/components/admin/domains/PlatformDomainsField'
        }
      }
    }
  ]
};

export default platformSettings;
