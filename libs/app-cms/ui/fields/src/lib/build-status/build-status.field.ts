import type { UIField } from 'payload';

/** Live build result of a custom component, shown in place of the raw group. */
export const buildStatusField: UIField = {
  name: 'buildStatus',
  type: 'ui',
  admin: {
    components: {
      Field: '@codeware/app-cms/ui/fields/build-status/BuildStatus.client'
    }
  }
};
