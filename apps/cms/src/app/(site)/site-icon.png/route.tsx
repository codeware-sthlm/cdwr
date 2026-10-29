import {
  faviconSvg,
  fitMark,
  parseIconSize,
  svgDataUri,
  svgMark
} from '@codeware/shared/util/payload-utils';
import { ImageResponse } from 'next/og';

import { payloadRuntime } from '../../../security/payload-runtime';

/**
 * The mark as a PNG, for a browser that will not take an SVG favicon.
 *
 * `?size=` picks the side in pixels, 16 to 256. A bitmap cannot follow the tab's scheme, so it is drawn in the light one.
 */
export async function GET(request: Request): Promise<Response> {
  const size = parseIconSize(new URL(request.url).searchParams.get('size'));
  const runtime = await payloadRuntime({ asVisitor: true });
  const mark = svgMark(runtime.tenantConfig?.icon ?? null);
  const svg = mark ? faviconSvg(mark, 'light') : null;

  if (!svg) {
    return new Response(null, { status: 404 });
  }

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <img src={svgDataUri(svg)} {...fitMark(svg, size)} alt="" />
    </div>,
    {
      width: size,
      height: size,
      headers: { 'cache-control': 'public, max-age=3600' }
    }
  );
}
