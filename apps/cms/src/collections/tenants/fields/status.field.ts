import { systemUserAccess } from '@codeware/app-cms/util/access';
import { enumName } from '@codeware/app-cms/util/db';
import type { SelectField } from 'payload';

/**
 * Where a workspace is in its lifecycle, written by system users only.
 * Self-serve signups start `pending`; going live makes them `active`.
 */
export const statusField: SelectField = {
  name: 'status',
  type: 'select',
  label: { en: 'Status', sv: 'Status' },
  enumName: enumName('tenant_status'),
  options: [
    { label: { en: 'Pending', sv: 'Väntar' }, value: 'pending' },
    { label: { en: 'Active', sv: 'Aktiv' }, value: 'active' }
  ],
  defaultValue: 'active',
  required: true,
  access: {
    create: systemUserAccess,
    update: systemUserAccess
  },
  admin: {
    description: {
      en: 'Pending workspaces come from self-serve signup and are not deployed until activated.',
      sv: 'Väntande arbetsytor kommer från egen registrering och driftsätts inte förrän de aktiveras.'
    }
  }
};
