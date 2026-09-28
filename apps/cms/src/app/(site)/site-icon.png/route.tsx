import { ImageResponse } from 'next/og';

import { payloadRuntime } from '../../../security/payload-runtime';
import {
  faviconSvg,
  fitMark,
  svgDataUri,
  svgMark
} from '../../../utils/site-icon';

const SIZE = 32;

/**
 * The mark as a PNG, for a browser that will not take an SVG favicon.
 *
 * A bitmap cannot follow the tab's scheme, so it is drawn in the light one.
 */
export async function GET(): Promise<Response> {
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
      <img src={svgDataUri(svg)} {...fitMark(svg, SIZE)} alt="" />
    </div>,
    {
      width: SIZE,
      height: SIZE,
      headers: { 'cache-control': 'public, max-age=3600' }
    }
  );
}
