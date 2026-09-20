import { adminGroups } from '@codeware/app-cms/util/definitions';
import { ensureTenantFromApiKey } from '@codeware/app-cms/util/misc';
import type { FormSubmission } from '@codeware/shared/util/payload-types';
import { formBuilderPlugin } from '@payloadcms/plugin-form-builder';
import type { Access } from 'payload';

import { applyDefaultRecipient } from './forms/apply-default-recipient';
import { applyDefaultSender } from './forms/apply-default-sender';
import { attachSubmissionId } from './forms/attach-submission-id';
import { customizedFields } from './forms/customized-fields';
import { formFields } from './forms/form-fields';
import { recordDeliveryStatus } from './forms/record-delivery-status';
import { requireResolvableRecipient } from './forms/require-resolvable-recipient';
import { submissionCreateAccess } from './forms/submission-create-access';
import { submissionFields } from './forms/submission-fields';
import { verifyFormTenant } from './forms/verify-form-tenant';

type Options = {
  /**
   * Tenant scoped access controls for the collections this plugin adds.
   *
   * Owned by the app since the tenant scope is resolved from the runtime
   * environment.
   */
  access: {
    /** Client read access — admin users and tenant api keys */
    read: Access;
    readEditorsOnly: Access;
    /** Write access — admin users only */
    write: Access;
  };
};

export const getFormsPlugin = ({ access }: Options) => {
  return formBuilderPlugin({
    beforeEmail: async (emails, params) =>
      attachSubmissionId(
        await applyDefaultRecipient(
          await applyDefaultSender(emails, params),
          params
        ),
        params
      ),
    fields: {
      ...customizedFields,
      // Disable unsupported form fields
      payment: false,
      state: false,
      upload: false
    },
    formOverrides: {
      // The plugin default is `read: () => true`, leaving every tenant's forms
      // world readable
      access: {
        read: access.read,
        create: access.write,
        update: access.write,
        delete: access.write
      },
      fields: formFields,
      admin: {
        defaultColumns: ['title', 'submissions', 'updatedAt'],
        group: adminGroups['forms'],
        description: {
          en: 'Build contact and signup forms to place on your pages.',
          sv: 'Bygg kontakt- och anmälningsformulär att placera på dina sidor.'
        }
      },
      hooks: {
        beforeValidate: [requireResolvableRecipient]
      }
    },
    formSubmissionOverrides: {
      // The plugin defaults leave submissions readable by any authenticated
      // identity and deletable by the Payload default, neither of which scopes
      // an api key to its own tenant. `update` repeats the plugin's own default
      // so submissions stay immutable without depending on how it merges.
      access: {
        create: submissionCreateAccess,
        // Submitted details are personal data, so readers are excluded here
        // even though they may read the form itself to fill it in
        read: access.readEditorsOnly,
        update: () => false,
        delete: access.write
      },
      fields: submissionFields,
      admin: {
        group: adminGroups['forms'],
        description: {
          en: 'Messages visitors have sent through the forms on your website.',
          sv: 'Meddelanden som besökare har skickat via formulären på din webbplats.'
        },
        components: {
          views: {
            list: {
              Component:
                '@codeware/apps/cms/components/admin/submissions/SubmissionsListView'
            },
            edit: {
              default: {
                Component:
                  '@codeware/apps/cms/components/admin/submissions/SubmissionDetailView'
              }
            }
          }
        }
      },
      hooks: {
        beforeValidate: [
          ensureTenantFromApiKey<FormSubmission>(),
          verifyFormTenant
        ],
        // The plugin appends these behind its own send hook, so this runs
        // once every notification for the submission has settled
        afterChange: [recordDeliveryStatus]
      }
    },
    redirectRelationships: ['pages']
  });
};
