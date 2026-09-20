import { canEdit } from '@codeware/app-cms/util/misc';
import { draftMode } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';
import { getPayload } from 'payload';

import config from '../../../payload.config';

/**
 * Enable Next.js draft mode for Payload CMS live preview.
 *
 * The Payload admin panel opens this route in an iframe before navigating
 * to the preview URL, allowing draft content to be fetched server-side.
 *
 * Query params:
 * - `redirect` — the site path to render after enabling draft mode (required)
 *
 * Authentication: validates the Payload session cookie so only logged-in
 * admin users can enable draft mode. Tenant API key clients are not allowed.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const redirectTo = searchParams.get('redirect');

  if (!redirectTo) {
    return new Response('Missing redirect parameter', { status: 400 });
  }

  if (!redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
    return new Response('Invalid redirect path', { status: 400 });
  }

  try {
    // Check for a human admin user session via the request's session cookie.
    // We use getPayload + payload.auth directly to avoid getAuthenticatedPayload,
    // which in tenant mode falls back to the tenant API key and would allow
    // any API key client to enable draft mode.
    const payload = await getPayload({ config: await config });
    const { user } = await payload.auth({ headers: request.headers });

    if (!canEdit(user)) {
      return new Response('Unauthorized', { status: 401 });
    }
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  const draft = await draftMode();
  draft.enable();

  redirect(redirectTo);
}
