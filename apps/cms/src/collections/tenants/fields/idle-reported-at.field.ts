import { systemUserAccess } from '@codeware/app-cms/util/access';
import type { DateField } from 'payload';

/**
 * When the platform was told an idle workspace needs deprovisioning by hand.
 * Written by the nightly cleanup, editable by system users only.
 */
export const idleReportedAtField: DateField = {
  name: 'idleReportedAt',
  type: 'date',
  label: {
    en: 'Idle report sent',
    sv: 'Inaktivitetsrapport skickad'
  },
  access: {
    create: systemUserAccess,
    update: systemUserAccess
  },
  admin: {
    readOnly: true,
    date: { pickerAppearance: 'dayAndTime' },
    description: {
      en: 'When the platform was told this idle workspace has provisioning traces and needs deprovisioning by hand. Set by the nightly cleanup.',
      sv: 'När plattformen fick veta att den här inaktiva arbetsytan har driftsättningsspår och behöver avvecklas för hand. Sätts av den nattliga städningen.'
    }
  }
};
