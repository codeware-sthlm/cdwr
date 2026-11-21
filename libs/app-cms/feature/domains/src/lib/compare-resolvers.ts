import { randomBytes } from 'node:crypto';
import { Resolver } from 'node:dns/promises';

import {
  PUBLIC_RESOLVERS,
  type RecordSet,
  type ResolverAnswer,
  type ResolverComparison,
  emptyRecordSet,
  hasRecords,
  normaliseRecords,
  resolversAgree
} from './resolver-comparison';

/** Each query is short: this runs while someone waits, three times over */
const QUERY_TIMEOUT_MS = 2500;

const makeResolver = (address: string) => {
  const resolver = new Resolver({ timeout: QUERY_TIMEOUT_MS, tries: 1 });
  resolver.setServers([address]);
  return resolver;
};

type Lookup = { records: Array<string>; error?: string };

/**
 * Ask one resolver for one record type, and treat "no answer" as an answer
 * rather than a failure.
 *
 * NXDOMAIN and NODATA are exactly what a caller is here to see — the record
 * has not landed at this resolver yet — so they come back as an empty record
 * list, not an error. Only a resolver that could not be reached at all is an
 * error, because that says nothing about the domain.
 */
const lookup = async (query: () => Promise<Array<string>>): Promise<Lookup> => {
  try {
    return { records: normaliseRecords(await query()) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code ?? '';
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return { records: [] };
    }
    return {
      records: [],
      error: code || (error instanceof Error ? error.message : String(error))
    };
  }
};

/**
 * A, AAAA and CNAME for one name, from one resolver.
 *
 * `resolve4` follows a CNAME, so a subdomain pointed by CNAME answers all
 * three; whoever reads the set looks at the CNAME first.
 */
const askRecordSet = async (
  resolver: Resolver,
  hostname: string
): Promise<{ records: RecordSet; error?: string }> => {
  const [a, aaaa, cname] = await Promise.all([
    lookup(() => resolver.resolve4(hostname)),
    lookup(() => resolver.resolve6(hostname)),
    lookup(() => resolver.resolveCname(hostname))
  ]);
  return {
    records: { a: a.records, aaaa: aaaa.records, cname: cname.records },
    error: a.error ?? aaaa.error ?? cname.error
  };
};

/** Ask one resolver about the domain and its challenge record */
const askOne = async (
  { name, address }: { name: string; address: string },
  hostname: string
): Promise<ResolverAnswer> => {
  const resolver = makeResolver(address);
  const [host, challenge] = await Promise.all([
    askRecordSet(resolver, hostname),
    lookup(() => resolver.resolveCname(`_acme-challenge.${hostname}`))
  ]);
  const error = host.error ?? challenge.error;

  return error
    ? {
        resolver: name,
        records: emptyRecordSet(),
        challenge: [],
        error
      }
    : { resolver: name, records: host.records, challenge: challenge.records };
};

/**
 * The zone a domain lives in, with its negative-cache ttl, or null when no
 * SOA could be read.
 */
const findZone = async (
  resolver: Resolver,
  hostname: string
): Promise<{ zone: string; minttl: number } | null> => {
  // The SOA lives on the zone, not on the subdomain, so walk up until one
  // answers — a two-label name is as far as this is worth taking
  const labels = hostname.split('.');
  for (let index = 0; index < labels.length - 1; index++) {
    const zone = labels.slice(index).join('.');
    try {
      const { minttl } = await resolver.resolveSoa(zone);
      return { zone, minttl };
    } catch {
      // Not the zone apex — try the next label up
    }
  }
  return null;
};

/**
 * The zone's name servers, the way the public resolvers know them.
 *
 * Asked of a public resolver, not of the parent zone's servers: what matters
 * is where the internet goes for the domain's records, and that is what a
 * resolver follows.
 */
const readNameServers = async (
  resolver: Resolver,
  zone: string
): Promise<ResolverComparison['nameServers']> => {
  const { records, error } = await lookup(() => resolver.resolveNs(zone));
  return error || !records.length ? null : { zone, servers: records };
};

/**
 * What a `*` record in the zone answers, by asking for a name nobody created.
 *
 * The label is random, so a hit can only come from a wildcard.
 */
const probeWildcard = async (
  resolver: Resolver,
  zone: string
): Promise<RecordSet | null> => {
  const probe = `_cdwr-probe-${randomBytes(6).toString('hex')}.${zone}`;
  const { records, error } = await askRecordSet(resolver, probe);
  return error || !hasRecords(records) ? null : records;
};

/**
 * Where a domain is served, and what its zone holds besides the domain
 * itself.
 *
 * Deliberately never throws: this is context for the comparison, and losing
 * it should cost these facts, not the whole answer.
 */
const readZone = async (
  hostname: string
): Promise<
  Pick<ResolverComparison, 'negativeCacheTtl' | 'nameServers' | 'wildcard'>
> => {
  const resolver = makeResolver(PUBLIC_RESOLVERS[0].address);
  const found = await findZone(resolver, hostname);
  if (!found) {
    return { negativeCacheTtl: null, nameServers: null, wildcard: null };
  }

  const [nameServers, wildcard] = await Promise.all([
    readNameServers(resolver, found.zone),
    probeWildcard(resolver, found.zone)
  ]);
  return { negativeCacheTtl: found.minttl, nameServers, wildcard };
};

/**
 * What every public resolver currently says about a domain, side by side.
 *
 * Exists because the failure it catches is invisible from anywhere else: a
 * browser reporting NXDOMAIN while Fly, the registrar and every independent
 * resolver already agree on a working answer means the stale copy is on the
 * asker's own side — their router, their ISP, their laptop. Diagnosing that
 * otherwise means running `dig` by hand against a handful of resolvers.
 *
 * Every resolver is asked for A, AAAA and CNAME on the domain and for the
 * CNAME on its challenge name, so what the domain answers can be held against
 * what it should answer. The zone's name servers come along, since records
 * created where the domain is not served never reach anyone.
 *
 * Deliberately does *not* query the domain's authoritative nameservers. Three
 * independent resolvers agreeing is already the signal; going to the source
 * would only confirm what they said, at the cost of an address lookup per
 * nameserver and a third class of failure to explain.
 *
 * @param hostname - The domain to ask about
 */
export const compareResolvers = async (
  hostname: string
): Promise<ResolverComparison> => {
  const [answers, zone] = await Promise.all([
    Promise.all(PUBLIC_RESOLVERS.map((resolver) => askOne(resolver, hostname))),
    readZone(hostname)
  ]);

  return {
    hostname,
    answers,
    agree: resolversAgree(answers),
    ...zone
  };
};
