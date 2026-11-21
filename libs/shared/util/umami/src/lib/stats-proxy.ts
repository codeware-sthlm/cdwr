import { clientIp } from '@codeware/shared/util/human-check';

/** Where the site's statistics script and beacon are served from, first-party */
export const STATS_PATH = '/stats';

/** What a path under `/stats/` is forwarded as; anything else is a 404 */
type Route = 'script' | 'recorder' | 'send' | 'settings' | 'record';

/** The fixed paths, each with the one method it answers */
const FIXED = {
  'script.js': { route: 'script', method: 'GET' },
  'recorder.js': { route: 'recorder', method: 'GET' },
  'api/send': { route: 'send', method: 'POST' },
  'api/record': { route: 'record', method: 'POST' }
} as const satisfies Record<string, { route: Route; method: 'GET' | 'POST' }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A page view or event is a few hundred bytes; anything near this is not one */
export const MAX_BODY_BYTES = 16 * 1024;

/** A heatmap batch is 20 events, each carrying the page's full address */
export const MAX_RECORD_BYTES = 64 * 1024;

/** The tracker's session token, sent back on every beacon after the first */
export const CACHE_HEADER = 'x-umami-cache';
const MAX_CACHE_LENGTH = 2048;

/** The header Umami reads the visitor's address from (its `CLIENT_IP_HEADER`) */
export const CLIENT_IP_HEADER = 'x-cdwr-client-ip';

const isFixed = (path: string): path is keyof typeof FIXED =>
  Object.hasOwn(FIXED, path);

/**
 * The route a path and method resolve to, or `null`.
 *
 * The recorder's settings path carries a website id, so it is matched on its
 * segments, with the id held to a UUID: nothing else can reach Umami.
 */
const route = (
  path: ReadonlyArray<string>,
  method: string
): { route: Route; upstream: string; websiteId?: string } | null => {
  const joined = path.join('/');
  if (isFixed(joined)) {
    const { route, method: allowed } = FIXED[joined];
    return method === allowed ? { route, upstream: joined } : null;
  }
  const [api, websites, id, recorder, ...rest] = path;
  return method === 'GET' &&
    api === 'api' &&
    websites === 'websites' &&
    id !== undefined &&
    UUID.test(id) &&
    recorder === 'recorder' &&
    rest.length === 0
    ? { route: 'settings', upstream: joined, websiteId: id.toLowerCase() }
    : null;
};

/** A heatmap batch for the given website, and nothing else: replay is refused */
const isHeatmapFor = (body: unknown, websiteId: string): boolean =>
  typeof body === 'object' &&
  body !== null &&
  'type' in body &&
  body.type === 'heatmap' &&
  'payload' in body &&
  typeof body.payload === 'object' &&
  body.payload !== null &&
  'website' in body.payload &&
  typeof body.payload.website === 'string' &&
  body.payload.website.toLowerCase() === websiteId;

const parseJson = (
  text: string
): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
};

const status = (code: number) => new Response(null, { status: code });

/**
 * The request body as text, or `null` once it passes `max` bytes.
 *
 * Reads the stream itself rather than trusting `content-length`: a chunked
 * request declares no length, and buffering it whole before checking would
 * let one request hold as much memory as it likes.
 */
const readCapped = async (
  request: Request,
  max: number
): Promise<string | null> => {
  if (Number(request.headers.get('content-length') ?? 0) > max) {
    return null;
  }
  const reader = request.body?.getReader();
  if (!reader) {
    return '';
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
};

/** A script served from Umami, cached unless Umami answered with an error */
const forwardScript = async (url: URL, fetchImpl: typeof fetch) => {
  const upstream = await fetchImpl(url);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type':
        upstream.headers.get('content-type') ?? 'application/javascript',
      // Umami suspends when idle; an error while it wakes must not stick for an hour
      'cache-control': upstream.ok ? 'public, max-age=3600' : 'no-store'
    }
  });
};

/** A body already read and checked, posted on with the visitor's agent, address and token */
const forwardPost = async (
  request: Request,
  url: URL,
  body: string,
  fetchImpl: typeof fetch
) => {
  const ip = clientIp(request.headers);
  // The tracker returns the token from its first beacon on the next ones,
  // which keeps one visit together; a token is a short JWT, never kilobytes
  const cache = request.headers.get(CACHE_HEADER);
  const cacheOk = cache !== null && cache.length <= MAX_CACHE_LENGTH;
  const upstream = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': request.headers.get('user-agent') ?? '',
      ...(ip ? { [CLIENT_IP_HEADER]: ip } : {}),
      ...(cache && cacheOk ? { [CACHE_HEADER]: cache } : {})
    },
    body
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json'
    }
  });
};

/**
 * Forward the site's statistics scripts, beacons and heatmaps to Umami.
 *
 * Only these reach Umami; anything else is a 404, so this is not an open relay:
 * - `script.js` and `recorder.js`
 * - `api/send`, the tracker's beacon
 * - `api/websites/<id>/recorder`, the recorder's settings, for the tenant's own website only
 * - `api/record`, heatmap batches for the tenant's own website only. Session
 *   replay shares the path and is refused, even when switched on in Umami.
 *
 * Neither the visitor's address nor the payload is logged here.
 *
 * @param options - The request, the path after `/stats/`, Umami's base URL
 *   (`undefined` turns statistics off), the tenant's website id, read only
 *   for the paths that check it, and `fetch` for tests
 */
export async function proxyStats(options: {
  request: Request;
  path: ReadonlyArray<string>;
  umamiUrl: string | undefined;
  websiteId: () => Promise<string | null | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const { request, path, umamiUrl, websiteId, fetchImpl = fetch } = options;
  const target = route(path, request.method);

  if (!umamiUrl || !target) {
    return status(404);
  }

  const url = new URL(
    target.upstream,
    umamiUrl.endsWith('/') ? umamiUrl : `${umamiUrl}/`
  );

  try {
    switch (target.route) {
      case 'script':
      case 'recorder':
        return await forwardScript(url, fetchImpl);

      case 'settings': {
        const own = (await websiteId())?.toLowerCase();
        if (!own) {
          return status(404);
        }
        if (own !== target.websiteId) {
          return status(403);
        }
        const upstream = await fetchImpl(url);
        if (!upstream.ok) {
          return new Response(null, {
            status: upstream.status,
            headers: { 'cache-control': 'no-store' }
          });
        }
        const settings = parseJson(await upstream.text());
        if (
          !settings.ok ||
          typeof settings.value !== 'object' ||
          settings.value === null
        ) {
          return status(502);
        }
        // Replay would be refused below anyway, but the recorder would still
        // capture the page in the visitor's browser; off here, it never starts
        return Response.json(
          { ...settings.value, replayEnabled: false },
          { headers: { 'cache-control': 'public, max-age=60' } }
        );
      }

      case 'send':
      case 'record': {
        if (
          !request.headers.get('content-type')?.includes('application/json')
        ) {
          return status(415);
        }
        // Read under the cap before anything parses it
        const body = await readCapped(
          request,
          target.route === 'record' ? MAX_RECORD_BYTES : MAX_BODY_BYTES
        );
        if (body === null) {
          return status(413);
        }
        if (target.route === 'record') {
          const parsed = parseJson(body);
          if (!parsed.ok) {
            return status(400);
          }
          const own = (await websiteId())?.toLowerCase();
          if (!own) {
            return status(404);
          }
          if (!isHeatmapFor(parsed.value, own)) {
            return status(403);
          }
        }
        return await forwardPost(request, url, body, fetchImpl);
      }
    }
  } catch {
    // Statistics never break a page; the visitor sees nothing either way
    return status(502);
  }
}

/**
 * The attributes of the site's statistics scripts, the tracker and the
 * heatmap recorder, or `null` when nothing should be collected: no Umami
 * configured, or no website id for the tenant.
 */
export const statsScript = (options: {
  umamiUrl: string | undefined;
  websiteId: string | null | undefined;
  nonce: string | undefined;
}) => {
  if (!options.umamiUrl || !options.websiteId) {
    return null;
  }
  const shared = {
    'data-website-id': options.websiteId,
    'data-host-url': STATS_PATH,
    nonce: options.nonce
  };
  return {
    tracker: { src: `${STATS_PATH}/script.js`, ...shared },
    recorder: { src: `${STATS_PATH}/recorder.js`, ...shared }
  };
};
