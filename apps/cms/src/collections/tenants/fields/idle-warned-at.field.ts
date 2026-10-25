import { systemUserAccess } from '@codeware/app-cms/util/access';
import type { DateField } from 'payload';

/**
 * When the workspace's admins were warned, or the platform was told it needs
 * deprovisioning by hand. Written by the nightly cleanup, editable by system users only.
 */
export const idleWarnedAtField: DateField = {
  name: 'idleWarnedAt',
  type: 'date',
  label: {
    en: 'Idle warning sent',
    sv: 'Varning om inaktivitet skickad'
  },
  access: {
    create: systemUserAccess,
    update: systemUserAccess
  },
  admin: {
    readOnly: true,
    date: { pickerAppearance: 'dayAndTime' },
    description: {
      en: "When the workspace's admins were warned, or the platform was told it needs deprovisioning by hand. Set by the nightly cleanup.",
      sv: 'När arbetsytans administratörer varnades, eller plattformen fick veta att den behöver avvecklas för hand. Sätts av den nattliga städningen.'
    }
  }
};
