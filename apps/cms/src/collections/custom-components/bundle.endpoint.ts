import { COMPONENT_HASH_PATTERN } from '@codeware/shared/util/payload-utils';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import type { Endpoint, PayloadRequest } from 'payload';

const FILE_PATTERN = /^([^./]+)\.js$/;

const notFound = () =>
  Response.json(
    { error: getReasonPhrase(StatusCodes.NOT_FOUND) },
    { status: StatusCodes.NOT_FOUND }
  );

/**
 * Serves a built component bundle by its content hash.
 *
 * Public on purpose: a `<script>` tag cannot send an API key, and a compiled
 * bundle is what every visitor downloads anyway. The hash names the content,
 * so the response never changes and is cached for good.
 */
export const customComponentBundleEndpoint: Endpoint = {
  path: '/bundle/:file',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const file = req.routeParams?.['file'];
    const hash = typeof file === 'string' ? FILE_PATTERN.exec(file)?.[1] : null;

    if (!hash || !COMPONENT_HASH_PATTERN.test(hash)) {
      return notFound();
    }

    const { docs } = await req.payload.find({
      collection: 'custom-components',
      where: { 'build.hash': { equals: hash } },
      limit: 1,
      depth: 0,
      pagination: false,
      select: { build: { js: true } },
      overrideAccess: true
    });

    const js = docs[0]?.build.js;
    if (!js) {
      return notFound();
    }

    return new Response(js, {
      status: StatusCodes.OK,
      headers: {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }
};
