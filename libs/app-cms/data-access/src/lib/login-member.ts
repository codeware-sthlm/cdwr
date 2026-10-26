import { mustEnrolTotp } from '@codeware/app-cms/util/access';
import type { User } from '@codeware/shared/util/payload-types';
import type { BasePayload } from 'payload';

/**
 * What a correct password leads to: straight in, the authenticator code, or a
 * refusal until the account sets TOTP up in the admin
 */
export type SecondFactor = 'none' | 'code' | 'setup';

/**
 * Sign a visitor in to the site with their workspace credentials.
 *
 * The same `users` login the admin uses — a reader is an ordinary user, so
 * there is no second identity to maintain. What a successful login *grants*
 * is decided entirely by access control: membership of this workspace is what
 * opens members-only content, and holding no membership here simply leaves
 * the site looking public.
 *
 * Returns `null` for any failure — wrong password, unknown address, a locked
 * account — so a caller cannot tell them apart and neither can a visitor
 * probing for which addresses exist.
 *
 * @param payload - Payload instance
 * @param credentials - Email and password as submitted
 * @returns The session token and the second factor still to come, or `null`
 *   when the credentials do not sign in
 */
export async function loginMember(
  payload: BasePayload,
  credentials: { email: string; password: string }
): Promise<{ token: string; secondFactor: SecondFactor } | null> {
  try {
    const { token, user } = await payload.login({
      collection: 'users',
      data: {
        email: credentials.email,
        password: credentials.password
      }
    });

    if (!token) {
      return null;
    }

    // `hasTotp` is set by `payload-totp` when the user document is read
    const enrolled = Boolean((user as { hasTotp?: unknown }).hasTotp);

    return {
      token,
      secondFactor: enrolled
        ? 'code'
        : mustEnrolTotp(user as User)
          ? 'setup'
          : 'none'
    };
  } catch {
    // Payload throws on bad credentials and on a locked account alike. The
    // distinction is deliberately not surfaced.
    return null;
  }
}
