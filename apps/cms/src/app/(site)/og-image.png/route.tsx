import { ImageResponse } from 'next/og';

import { payloadRuntime } from '../../../security/payload-runtime';
import { isSiteGated } from '../../../utils/site-gated';

/**
 * What a shared link shows for a page with no image of its own: the site's name on a neutral card, 1200×630.
 *
 * Neutral colours on purpose: the card is drawn without a stylesheet, so the
 * theme's tokens are not at hand, and nothing here needs a script.
 */
export async function GET(): Promise<Response> {
  // The gate lets file-like paths through, so this one keeps a gated site's
  // name to itself
  if (isSiteGated()) {
    return new Response(null, { status: 404 });
  }

  const runtime = await payloadRuntime({ asVisitor: true });
  const name = runtime.tenantConfig?.appName ?? 'Codeware CMS';

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
        background: '#0f172a',
        color: '#f8fafc',
        fontSize: 88,
        fontWeight: 700,
        textAlign: 'center'
      }}
    >
      {name}
    </div>,
    {
      width: 1200,
      height: 630,
      headers: { 'cache-control': 'public, max-age=3600' }
    }
  );
}
