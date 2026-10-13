import { clientIp } from '@codeware/shared/util/human-check';

/** Where the site's statistics script and beacon are served from, first-party */
export const STATS_PATH = '/stats';

/** The only paths forwarded to Umami, each with the one method it answers */
const TARGETS = {
  'script.js': 'GET',
  'api/send': 'POST'
} as const satisfies Record<string, 'GET' | 'POST'>;

/** A page view or event is a few hundred bytes; anything near this is not one */
export const MAX_BODY_BYTES = 16 * 1024;

/** The tracker's session token, sent back on every beacon after the first */
export const CACHE_HEADER = 'x-umami-cache';
const MAX_CACHE_LENGTH = 2048;

/** The header Umami reads the visitor's address from (its `CLIENT_IP_HEADER`) */
export const CLIENT_IP_HEADER = 'x-cdwr-client-ip';

const isTarget = (path: string): path is keyof typeof TARGETS =>
  Object.hasOwn(TARGETS, path);

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
  return new TextDecoder().decode(Buffer.concat(chunks));
};

/**
 * Forward the site's statistics script and beacon to Umami.
 *
 * Exactly two paths reach Umami, `script.js` and `api/send`; anything else is
 * a 404, so this is not an open relay. Neither the visitor's address nor the
 * payload is logged here.
 *
 * @param options - The request, the path after `/stats/`, Umami's base URL
 *   (`undefined` turns statistics off), and `fetch` for tests
 */
export async function proxyStats(options: {
  request: Request;
  path: ReadonlyArray<string>;
  umamiUrl: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const { request, path, umamiUrl, fetchImpl = fetch } = options;
  const target = path.join('/');

  if (!umamiUrl || !isTarget(target) || TARGETS[target] !== request.method) {
    return status(404);
  }

  const url = new URL(
    target,
    umamiUrl.endsWith('/') ? umamiUrl : `${umamiUrl}/`
  );

  try {
    if (target === 'script.js') {
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
    }

    if (!request.headers.get('content-type')?.includes('application/json')) {
      return status(415);
    }
    const body = await readCapped(request, MAX_BODY_BYTES);
    if (body === null) {
      return status(413);
    }

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
        'content-type':
          upstream.headers.get('content-type') ?? 'application/json'
      }
    });
  } catch {
    // Statistics never break a page; the visitor sees nothing either way
    return status(502);
  }
}

/**
 * The attributes of the site's statistics script, or `null` when nothing
 * should be collected: no Umami configured, or no website id for the tenant.
 */
export const statsScript = (options: {
  umamiUrl: string | undefined;
  websiteId: string | null | undefined;
  nonce: string | undefined;
}) =>
  options.umamiUrl && options.websiteId
    ? {
        src: `${STATS_PATH}/script.js`,
        'data-website-id': options.websiteId,
        'data-host-url': STATS_PATH,
        nonce: options.nonce
      }
    : null;
