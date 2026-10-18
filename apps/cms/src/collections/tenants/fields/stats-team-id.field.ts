import { systemUserAccess } from '@codeware/app-cms/util/access';
import { customT } from '@codeware/app-cms/util/i18n';
import type { TextField, TextFieldSingleValidation } from 'payload';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validateStatsTeamId: TextFieldSingleValidation = (value, { req }) => {
  // Optional: an empty id means no team yet
  if (!value || uuidPattern.test(value)) {
    return true;
  }

  return customT(req.t)('validation:statsTeamIdInvalid');
};

/**
 * The workspace's team id in Umami, set by provisioning and editable by
 * system users only. Empty means the workspace has no team yet.
 */
export const statsTeamIdField: TextField = {
  name: 'statsTeamId',
  type: 'text',
  label: { en: 'Statistics team ID', sv: 'Statistik-team-ID' },
  validate: validateStatsTeamId,
  access: {
    create: systemUserAccess,
    update: systemUserAccess
  },
  admin: {
    description: {
      en: "The id of the workspace's team in Umami. Set by provisioning; leave empty when there is no team.",
      sv: 'Arbetsytans team-id i Umami. Sätts vid driftsättning; lämna tomt när det saknas team.'
    }
  }
};
