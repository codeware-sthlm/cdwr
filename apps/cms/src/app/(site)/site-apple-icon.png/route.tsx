import { ImageResponse } from 'next/og';

import { payloadRuntime } from '../../../security/payload-runtime';
import {
  faviconSvg,
  fitMark,
  svgDataUri,
  svgMark
} from '../../../utils/site-icon';

const SIZE = 180;

/**
 * The mark for a home screen: an opaque square with room around it, since iOS
 * fills transparency with black and rounds the corners itself.
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
        justifyContent: 'center',
        background: '#ffffff'
      }}
    >
      <img src={svgDataUri(svg)} {...fitMark(svg, 124)} alt="" />
    </div>,
    {
      width: SIZE,
      height: SIZE,
      headers: { 'cache-control': 'public, max-age=3600' }
    }
  );
}
