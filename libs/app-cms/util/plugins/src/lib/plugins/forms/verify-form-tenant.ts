import { getId } from '@codeware/app-cms/util/misc';
import type { FormSubmission } from '@codeware/shared/util/payload-types';
import { APIError, type CollectionBeforeValidateHook } from 'payload';

/**
 * Reject a submission that targets another tenant's form.
 *
 * `ensureTenantFromApiKey` stamps the submission with the caller's own tenant,
 * but the form relation is whatever the client sent. Document ids are
 * sequential, so without this check a key could post to a guessed form id and
 * reach the other tenant — their form owns the notification email config, so
 * their recipients would receive attacker supplied content.
 *
 * Runs after `ensureTenantFromApiKey` and compares against the tenant on the
 * data rather than the identity, so it also covers callers that bypass access
 * control.
 */
export const verifyFormTenant: CollectionBeforeValidateHook<
  FormSubmission
> = async ({ data, operation, req }) => {
  if (operation !== 'create' || !data) {
    return data;
  }

  const formId = getId(data.form);
  const tenantId = getId(data.tenant);

  // Both are required fields — let validation report them when missing
  if (!formId || !tenantId) {
    return data;
  }

  const form = await req.payload.findByID({
    collection: 'forms',
    id: formId,
    depth: 0,
    // The caller cannot read a form it does not own, and that is exactly the
    // case to detect — resolve it here and answer with a denial, not a 404
    overrideAccess: true,
    disableErrors: true,
    // Inside the caller's transaction: a form created in it must not read as
    // missing and answer a legitimate submission with a 403
    req
  });

  if (!form || getId(form.tenant) !== tenantId) {
    throw new APIError('Form does not belong to the tenant', 403);
  }

  return data;
};
