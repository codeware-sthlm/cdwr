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

/**
 * An address written one way only, so Fly's spelling and a resolver's compare.
 *
 * IPv6 has many spellings of one address (`::` for any run of zero groups,
 * optional leading zeros); this writes every group out, without leading
 * zeros. IPv4 and anything unparseable pass through lowercased.
 */
const canonicalAddress = (address: string): string => {
  const lower = address.toLowerCase();
  if (!lower.includes(':')) {
    return lower;
  }
  const [head, tail] = lower.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const zeros =
    tail === undefined ? [] : Array(8 - left.length - right.length).fill('0');
  return [...left, ...zeros, ...right]
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':');
};

/**
 * How a record the domain needs compares with what public dns answers now.
 *
 * - `match`: it answers what it should
 * - `mismatch`: it answers something else, listed in `actual`
 * - `missing`: it answers nothing of this kind
 * - `unknown`: there is nothing to compare, because no resolver answered or
 *   the expected value is not known yet
 *
 * A clue, never a verdict: whether the domain is set up is Fly's call, and a
 * match here only says public dns already looks right.
 */
export type RecordVerdict = 'match' | 'mismatch' | 'missing' | 'unknown';

export type RecordJudgement = {
  verdict: RecordVerdict;
  /** What public dns answers, for a mismatch to name */
  actual: Array<string>;
};

/** What the domain should answer, from its stored certificate */
export type ExpectedRecords = {
  isApex: boolean;
  /** The CNAME target a subdomain points at, `<app>.fly.dev` */
  cname: string;
  /** The app's addresses, which an A or AAAA record points at */
  addresses: Array<{ type: 'A' | 'AAAA'; address: string }>;
  /** The challenge CNAME's target, when Fly has given one */
  challenge?: string | null;
};

export type RecordsJudgement = {
  /** The apex's A records, or a subdomain's when it is served by address */
  a: RecordJudgement;
  aaaa: RecordJudgement;
  /**
   * A subdomain's traffic record as a whole: its CNAME, or its A and AAAA
   * when they point at the app, which Fly accepts too. `unknown` for an apex.
   */
  traffic: RecordJudgement;
  challenge: RecordJudgement;
  /** A subdomain answers by address at the app rather than by CNAME */
  byAddress: boolean;
  /**
   * A subdomain's A and AAAA records that point elsewhere. A CNAME cannot sit
   * beside them, so they have to go before it can be created.
   */
  blockingAddresses: Array<string>;
};

const UNKNOWN: RecordJudgement = { verdict: 'unknown', actual: [] };

/** Judge one address type against the app's addresses of that type */
const judgeAddresses = (
  actual: Array<string>,
  expected: Array<string>
): RecordJudgement => {
  if (!expected.length) {
    return UNKNOWN;
  }
  if (!actual.length) {
    return { verdict: 'missing', actual };
  }
  const ours = new Set(expected.map(canonicalAddress));
  return {
    verdict: actual.every((address) => ours.has(canonicalAddress(address)))
      ? 'match'
      : 'mismatch',
    actual
  };
};

/** Judge a CNAME against its one expected target */
const judgeCname = (
  actual: Array<string>,
  expected: string | null | undefined
): RecordJudgement => {
  if (!expected) {
    return UNKNOWN;
  }
  if (!actual.length) {
    return { verdict: 'missing', actual };
  }
  const [target] = normaliseRecords([expected]);
  return {
    verdict: actual.includes(target) ? 'match' : 'mismatch',
    actual
  };
};

/**
 * Hold what public dns answers for a domain against what it should answer.
 *
 * Reads the first resolver that answered. When they disagree the record is
 * mid-propagation, which the resolver report already says; one reading is
 * enough to name what is wrong with it.
 *
 * Pure and free of `node:dns`, so the panel can run it in the browser against
 * a comparison it already holds.
 */
export const judgeRecords = (
  comparison: Pick<ResolverComparison, 'answers'> | null,
  expected: ExpectedRecords
): RecordsJudgement => {
  const answer = comparison?.answers.find((entry) => !entry.error);
  if (!answer) {
    return {
      a: UNKNOWN,
      aaaa: UNKNOWN,
      traffic: UNKNOWN,
      challenge: UNKNOWN,
      byAddress: false,
      blockingAddresses: []
    };
  }

  const { records } = answer;
  const ofType = (type: 'A' | 'AAAA') =>
    expected.addresses
      .filter((entry) => entry.type === type)
      .map((entry) => entry.address);

  // `resolve4` follows a CNAME, so a subdomain pointed by CNAME answers with
  // the target's addresses too; those are the CNAME's, not records of its own
  const pointedByCname = records.cname.length > 0;
  const a = pointedByCname ? UNKNOWN : judgeAddresses(records.a, ofType('A'));
  const aaaa = pointedByCname
    ? UNKNOWN
    : judgeAddresses(records.aaaa, ofType('AAAA'));
  const challenge = judgeCname(answer.challenge, expected.challenge);

  if (expected.isApex) {
    return {
      a,
      aaaa,
      traffic: UNKNOWN,
      challenge,
      byAddress: false,
      blockingAddresses: []
    };
  }

  if (pointedByCname) {
    return {
      a,
      aaaa,
      traffic: judgeCname(records.cname, expected.cname),
      challenge,
      byAddress: false,
      blockingAddresses: []
    };
  }

  const addresses = [...records.a, ...records.aaaa];
  if (!addresses.length) {
    return {
      a,
      aaaa,
      traffic: { verdict: 'missing', actual: [] },
      challenge,
      byAddress: false,
      blockingAddresses: []
    };
  }

  const ours = new Set(
    expected.addresses.map((entry) => canonicalAddress(entry.address))
  );
  const blockingAddresses = addresses.filter(
    (address) => !ours.has(canonicalAddress(address))
  );
  // A + AAAA at the app is a setup Fly accepts, so it is as good as the
  // CNAME; anything else is in the way of one
  const byAddress = a.verdict === 'match' && aaaa.verdict !== 'mismatch';

  return {
    a,
    aaaa,
    traffic: {
      verdict: byAddress
        ? 'match'
        : expected.addresses.length
          ? 'mismatch'
          : 'unknown',
      actual: addresses
    },
    challenge,
    byAddress,
    blockingAddresses: expected.addresses.length ? blockingAddresses : []
  };
};

/**
 * A good-enough zone for a domain before resolvers have named the real one.
 *
 * An apex is its own zone. A subdomain's is taken as its last two labels,
 * which is exact for `.se` and `.com` and wrong only under multi-part suffixes
 * like `.co.uk`; once resolvers are compared, the SOA walk's zone replaces it.
 */
export const guessZone = (hostname: string, isApex: boolean): string =>
  isApex ? hostname : hostname.split('.').slice(-2).join('.');

/**
 * A record's name as a registrar's form wants it: relative to the zone.
 *
 * Registrars append the domain themselves, so the full name typed there ends
 * up doubled. The zone itself has no part before it, and is written `@`,
 * which most registrars take (some want the field left empty instead).
 */
export const registrarName = (name: string, zone: string): string => {
  const [full] = normaliseRecords([name]);
  const [apex] = normaliseRecords([zone]);
  if (full === apex) {
    return '@';
  }
  return full.endsWith(`.${apex}`) ? full.slice(0, -apex.length - 1) : full;
};
