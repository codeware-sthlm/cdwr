import { systemUserAccess } from '@codeware/app-cms/util/access';
import { customT } from '@codeware/app-cms/util/i18n';
import type { TextField, TextFieldSingleValidation } from 'payload';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validateStatsWebsiteId: TextFieldSingleValidation = (value, { req }) => {
  // Optional: an empty id collects no statistics
  if (!value || uuidPattern.test(value)) {
    return true;
  }

  return customT(req.t)('validation:statsWebsiteIdInvalid');
};

/**
 * The workspace's website id in Umami, set by provisioning and editable by
 * system users only. Empty means no statistics are collected.
 */
export const statsWebsiteIdField: TextField = {
  name: 'statsWebsiteId',
  type: 'text',
  label: { en: 'Statistics website', sv: 'Statistikwebbplats' },
  validate: validateStatsWebsiteId,
  access: {
    create: systemUserAccess,
    update: systemUserAccess
  },
  admin: {
    description: {
      en: "The site's id in Umami. Set by provisioning; leave empty to collect no statistics.",
      sv: 'Webbplatsens id i Umami. Sätts vid driftsättning; lämna tomt för att inte samla in någon statistik.'
    }
  }
};
