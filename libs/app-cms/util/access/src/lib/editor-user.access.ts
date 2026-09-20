import { canEdit } from '@codeware/app-cms/util/misc';
import type { AccessArgs } from 'payload';

/**
 * Allows access to identities that may edit — a workspace user or admin, or a
 * platform system user. Named for the capability it grants, not for a role.
 *
 * Denies tenant API key clients, which the multi-tenant plugin never constrains
 * to a tenant — an identity check is the only thing standing between a key and
 * every tenant's documents.
 *
 * Also denies users holding only a `reader` role. This control guards the users
 * collection, which is a workspace's member register: a reader must not be able
 * to enumerate the other members.
 */
export const editorUserAccess = ({ req: { user } }: AccessArgs) =>
  canEdit(user);
