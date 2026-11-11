/**
 * Types and pure comparison rules for the resolver report.
 *
 * Deliberately free of `node:dns`: this module is reachable from the domains
 * barrel, which client components import, and a node builtin in that graph
 * breaks the browser bundle. The querying half lives behind the `/server`
 * entry point, which only the endpoint imports.
 */

/** Public resolvers queried side by side, by the name a person would recognise */
export const PUBLIC_RESOLVERS = [
  { name: 'Cloudflare', address: '1.1.1.1' },
  { name: 'Google', address: '8.8.8.8' },
  { name: 'Quad9', address: '9.9.9.9' }
] as const;

/**
 * What one name answers, per record type.
 *
 * Every type is asked for every name: an apex can only use A and AAAA, but a
 * subdomain may use either those or a CNAME, and asking one type alone reads a
 * subdomain served by address as having no answer at all. Each list is sorted
 * and lowercased so two answers compare directly.
 */
export type RecordSet = {
  a: Array<string>;
  aaaa: Array<string>;
  cname: Array<string>;
};

/** One resolver's answer, or the reason it did not give one */
export type ResolverAnswer = {
  resolver: string;
  /** What the domain itself answers */
  records: RecordSet;
  /** The CNAME at `_acme-challenge.<hostname>`, Fly's validation record */
  challenge: Array<string>;
  /** Set when a query failed or timed out, in which case the lists are empty */
  error?: string;
};

export type ResolverComparison = {
  hostname: string;
  answers: Array<ResolverAnswer>;
  /**
   * Whether every resolver that answered agreed.
   *
   * `false` is the interesting case, and the reason this exists: resolvers
   * disagreeing means the record is mid-propagation or something between the
   * asker and the internet is holding a stale copy — not that the record is
   * wrong. Resolvers that failed outright do not count as disagreement.
   */
  agree: boolean;
  /**
   * The zone's negative-cache ttl in seconds, from its SOA.
   *
   * How long a "this does not exist" answer can legitimately stick around
   * after the record is created. Turns "try waiting a bit" into a number.
   */
  negativeCacheTtl: number | null;
  /**
   * The zone the domain lives in and the name servers it is served by, or
   * null when they could not be read.
   *
   * The one fact that explains records created at one provider and never
   * seen: the domain is still served by another, so nothing created at the
   * first ever reaches a resolver.
   */
  nameServers: { zone: string; servers: Array<string> } | null;
  /**
   * What a `*` record in the zone answers, or null when there is none.
   *
   * Found by asking for a name nobody created; anything that answers it is the
   * wildcard. Harmless for the names on the card, since an exact record wins,
   * but it sends every other subdomain wherever it points.
   */
  wildcard: RecordSet | null;
};

/** An empty answer, for a name that has no records of any kind */
export const emptyRecordSet = (): RecordSet => ({ a: [], aaaa: [], cname: [] });

/** Whether a record set holds anything at all */
export const hasRecords = ({ a, aaaa, cname }: RecordSet): boolean =>
  a.length + aaaa.length + cname.length > 0;

/** One answer as a single string, so two answers compare directly */
const fingerprint = ({ records, challenge }: ResolverAnswer): string =>
  [records.a, records.aaaa, records.cname, challenge]
    .map((list) => list.join(','))
    .join('|');

/**
 * Whether every resolver that actually answered gave the same answer.
 *
 * Resolvers that could not be reached are ignored rather than counted as
 * disagreement — an unreachable resolver says nothing about the domain, and
 * letting one time out would otherwise raise a false alarm.
 *
 * Vacuously true when nobody answered: there is no disagreement to report,
 * and the per-resolver errors already say what went wrong.
 */
export const resolversAgree = (answers: Array<ResolverAnswer>): boolean => {
  const answered = answers.filter((answer) => !answer.error);
  const first = answered.at(0);
  return (
    !first ||
    answered.every((answer) => fingerprint(answer) === fingerprint(first))
  );
};

/**
 * Put two resolvers' answers into a form that compares directly.
 *
 * Case and the trailing root dot are presentation, and record order is not
 * meaningful — leaving any of them in would report a disagreement between two
 * resolvers saying the same thing.
 */
export const normaliseRecords = (records: Array<string>): Array<string> =>
  [
    ...new Set(records.map((record) => record.toLowerCase().replace(/\.$/, '')))
  ].sort();
