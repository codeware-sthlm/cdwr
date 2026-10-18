import { hasRole } from '@codeware/app-cms/util/misc';
import type { Field, FieldAccess } from 'payload';

/** The user themself, and system users */
const selfOrSystemUser: FieldAccess = ({ req: { user }, id }) =>
  hasRole(user, 'system-user') ||
  (user?.collection === 'users' && id !== undefined && user.id === id);

/** Nobody writes through the api; the stats-account endpoint overrides access */
const never: FieldAccess = () => false;

/** The user's Umami account, written only by the stats-account endpoint */
export const statsAccountField = (): Field => ({
  name: 'statsAccount',
  type: 'group',
  admin: { hidden: true },
  access: { read: selfOrSystemUser, create: never, update: never },
  fields: [
    { name: 'umamiUserId', type: 'text' },
    { name: 'createdAt', type: 'date' }
  ]
});
