import type { BasePayload } from 'payload';

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
 * @returns The session token, or `null` when the credentials do not sign in
 */
export async function loginMember(
  payload: BasePayload,
  credentials: { email: string; password: string }
): Promise<{ token: string } | null> {
  try {
    const { token } = await payload.login({
      collection: 'users',
      data: {
        email: credentials.email,
        password: credentials.password
      }
    });

    return token ? { token } : null;
  } catch {
    // Payload throws on bad credentials and on a locked account alike. The
    // distinction is deliberately not surfaced.
    return null;
  }
}
