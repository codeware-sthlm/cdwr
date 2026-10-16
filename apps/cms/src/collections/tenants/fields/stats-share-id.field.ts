import { systemUserAccess } from '@codeware/app-cms/util/access';
import { customT } from '@codeware/app-cms/util/i18n';
import type { TextField, TextFieldSingleValidation } from 'payload';

/** Umami's share slug: at most 50 URL-safe characters */
const sharePattern = /^[A-Za-z0-9_-]{1,50}$/;

const validateStatsShareId: TextFieldSingleValidation = (value, { req }) => {
  // Optional: an empty slug shows no link in the admin
  if (!value || sharePattern.test(value)) {
    return true;
  }

  return customT(req.t)('validation:statsShareIdInvalid');
};

/**
 * The share slug of the workspace's public Umami dashboard, set by
 * provisioning and editable by system users only. Empty means no link.
 */
export const statsShareIdField: TextField = {
  name: 'statsShareId',
  type: 'text',
  label: { en: 'Statistics share link', sv: 'Delningslänk för statistik' },
  validate: validateStatsShareId,
  access: {
    create: systemUserAccess,
    update: systemUserAccess
  },
  admin: {
    description: {
      en: "The share slug of the site's Umami dashboard. Set by provisioning; empty means no link in the admin.",
      sv: 'Delningskoden för webbplatsens Umami-panel. Sätts vid driftsättning; tomt betyder ingen länk i administrationen.'
    }
  }
};
