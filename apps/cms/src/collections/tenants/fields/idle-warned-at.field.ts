import { systemUserAccess } from '@codeware/app-cms/util/access';
import type { DateField } from 'payload';

/**
 * When the workspace's admins were warned that it will be deleted. Written by
 * the nightly cleanup, editable by system users only.
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
      en: "When the workspace's admins were warned that it will be deleted for never having a page. Set by the nightly cleanup.",
      sv: 'När arbetsytans administratörer varnades för att den tas bort eftersom den aldrig fått någon sida. Sätts av den nattliga städningen.'
    }
  }
};
