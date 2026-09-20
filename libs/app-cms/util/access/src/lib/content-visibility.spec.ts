import type { UserAny } from '@codeware/shared/util/payload-types';
import { describe, expect, it } from 'vitest';

import {
  contentVisibilityWhere,
  publicVisibilityWhere
} from './content-visibility';

const user = (
  role: 'user' | 'system-user',
  tenants: Array<{ tenant: number; role: 'reader' | 'user' | 'admin' }>
): UserAny => ({ id: 1, role, tenants }) as unknown as UserAny;

/** The identity the public site itself runs as */
const tenantApiKey = { id: 7, apiKey: 'k', slug: 'moon' } as unknown as UserAny;

const reader = user('user', [{ tenant: 7, role: 'reader' }]);
const editor = user('user', [{ tenant: 7, role: 'user' }]);
const otherReader = user('user', [{ tenant: 8, role: 'reader' }]);

describe('contentVisibilityWhere', () => {
  it('restricts the tenant api key', () => {
    // The single most important case: the public site renders through this
    // identity, so a null here would serve restricted pages to everyone.
    expect(contentVisibilityWhere(tenantApiKey, 7)).toEqual(
      publicVisibilityWhere
    );
  });

  it('restricts an unauthenticated visitor', () => {
    expect(contentVisibilityWhere(null, 7)).toEqual(publicVisibilityWhere);
    expect(contentVisibilityWhere(undefined, 7)).toEqual(publicVisibilityWhere);
  });

  it('opens everything to a member of this workspace', () => {
    expect(contentVisibilityWhere(reader, 7)).toBeNull();
  });

  it('restricts a member of a different workspace', () => {
    // Signed in, but not here — the cross-tenant case
    expect(contentVisibilityWhere(otherReader, 7)).toEqual(
      publicVisibilityWhere
    );
  });

  it('opens everything to an editor', () => {
    expect(contentVisibilityWhere(editor, 7)).toBeNull();
    expect(contentVisibilityWhere(user('system-user', []), 7)).toBeNull();
  });

  it('restricts when the tenant is unknown, rather than defaulting open', () => {
    expect(contentVisibilityWhere(reader, null)).toEqual(publicVisibilityWhere);
    expect(contentVisibilityWhere(reader, undefined)).toEqual(
      publicVisibilityWhere
    );
  });

  it('accepts a populated tenant as well as an id', () => {
    expect(contentVisibilityWhere(reader, { id: 7 } as never)).toBeNull();
  });

  it('treats a missing visibility value as public', () => {
    // Documents predating the field; nothing was restricted before it existed
    expect(publicVisibilityWhere).toEqual({
      or: [
        { visibility: { equals: 'public' } },
        { visibility: { exists: false } }
      ]
    });
  });
});
