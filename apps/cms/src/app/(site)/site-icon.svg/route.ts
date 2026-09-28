import { payloadRuntime } from '../../../security/payload-runtime';
import { faviconSvg, svgMark } from '../../../utils/site-icon';

/** The tenant's own mark as the favicon, following the tab's colour scheme */
export async function GET(): Promise<Response> {
  const runtime = await payloadRuntime({ asVisitor: true });
  const mark = svgMark(runtime.tenantConfig?.icon ?? null);
  const svg = mark ? faviconSvg(mark) : null;

  if (!svg) {
    return new Response(null, { status: 404 });
  }

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml',
      'cache-control': 'public, max-age=3600'
    }
  });
}
