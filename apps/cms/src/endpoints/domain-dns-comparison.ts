import {
  type ResolverComparison,
  parseHostname
} from '@codeware/app-cms/feature/domains';
// Server-only entry: `compareResolvers` reaches for `node:dns`, which cannot
// be in the graph the admin's client bundle pulls from the main barrel
import { compareResolvers } from '@codeware/app-cms/feature/domains/server';
import { hasRole } from '@codeware/app-cms/util/misc';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import {
  type Endpoint,
  type PayloadRequest,
  addDataAndFileToRequest,
  headersWithCors
} from 'payload';

type Body = { hostname?: unknown };

const fail = (status: StatusCodes, message?: string) =>
  Response.json({ error: message ?? getReasonPhrase(status) }, { status });

/**
 * What the public resolvers currently say about a domain, side by side.
 *
 * Kept apart from the certificate endpoint on purpose. That one talks to Fly
 * and answers in well under a second; this one waits on a dozen dns queries,
 * an SOA walk and a name-server lookup, and can be slow for reasons that have nothing to do with the
 * domain. Folding them together would make a sluggish resolver look like a
 * broken Fly check, which is the opposite of what this is for.
 *
 * Reads nothing and writes nothing — it only asks public resolvers about a
 * hostname the caller supplied. The `system-user` gate is there because the
 * latency is worth spending only for whoever is diagnosing a domain, not
 * because the answer is sensitive.
 */
export const domainDnsComparisonEndpoint: Endpoint = {
  path: '/domain-dns-comparison',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!hasRole(req.user ?? null, 'system-user')) {
      return fail(StatusCodes.FORBIDDEN);
    }

    await addDataAndFileToRequest(req);
    const body = (req.data ?? {}) as Body;
    const parsed = parseHostname(String(body.hostname ?? ''));

    if (!parsed.valid) {
      return fail(StatusCodes.BAD_REQUEST);
    }

    let comparison: ResolverComparison;

    try {
      comparison = await compareResolvers(parsed.hostname);
    } catch (error) {
      // Every per-resolver failure is already reported inside the comparison,
      // so reaching here means something broader — no outbound dns at all,
      // most likely. Say so rather than leaving the panel spinning.
      req.payload.logger.error(
        `[domainDnsComparison] failed for ${parsed.hostname}: ${String(error)}`
      );
      return fail(
        StatusCodes.BAD_GATEWAY,
        'DNS could not be queried from this machine.'
      );
    }

    return Response.json(comparison, {
      status: StatusCodes.OK,
      headers: headersWithCors({ headers: new Headers(), req })
    });
  }
};
