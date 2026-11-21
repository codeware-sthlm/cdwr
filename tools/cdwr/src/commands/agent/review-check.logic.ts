import {
  type Review,
  type ReviewOwn,
  reviewFileSchema,
  reviewOwnSchema,
  toReview
} from '@codeware/shared/util/agent-review';

/** The reviews table row the desk reads; `id` and `at` are the database's */
export interface ReviewRow extends Review {
  host: string;
  /** What the queue did on its own since the review before; absent when it was not read */
  own?: ReviewOwn;
  cost: number | null;
  model: string | null;
}

export type ReviewCheck =
  { ok: true; row: ReviewRow } | { ok: false; message: string };

const SECRET_PATTERNS = [
  // A JWT: eyJ, then two more dot-separated base64url parts
  /eyJ[\w-]*\.[\w-]+\.[\w-]+/,
  // An sk-/sk_ key
  /\bsk[-_][\w-]{8,}/,
  // GitHub, Slack, AWS and Supabase tokens by their prefixes
  /\b(gh[pousr]_|github_pat_)\w{20,}/,
  /\bxox[abprs]-[\w-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(sbp_|sb_secret_)\w{20,}/,
  /-----BEGIN/
];

/** A run of 40 or more base64 or hex characters holding a digit; a bare path or word has none */
const longRun = (text: string): boolean =>
  (text.match(/[A-Za-z0-9+/]{40,}/g) ?? []).some((run) => /\d/.test(run));

const looksSecret = (text: string): boolean =>
  SECRET_PATTERNS.some((pattern) => pattern.test(text)) || longRun(text);

/** The path of the first string in the value that looks like a secret, or null */
const findSecret = (value: unknown, path: string[] = []): string | null => {
  if (typeof value === 'string')
    return looksSecret(value) ? path.join('.') : null;
  if (typeof value !== 'object' || value === null) return null;
  for (const [key, child] of Object.entries(value)) {
    const found = findSecret(child, [...path, key]);
    if (found !== null) return found;
  }
  return null;
};

/**
 * Own items name files, tags and commit shas, which are public: the long-run check reads each path
 * segment with any full sha taken out, so only a real token is withheld
 */
const ownLooksSecret = (text: string): boolean =>
  SECRET_PATTERNS.some((pattern) => pattern.test(text)) ||
  text
    .replace(/\b[0-9a-f]{40}\b/g, ' ')
    .split('/')
    .some(longRun);

export const WITHHELD = '(withheld: secret-like text)';

/**
 * The own list from its file's text: null when there is none or it does not parse, since the
 * review itself still stands. A secret-like field is withheld, never the review.
 */
export const toOwn = (text: string | undefined): ReviewOwn | null => {
  if (text === undefined) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = reviewOwnSchema.safeParse(json);
  if (!parsed.success) return null;
  const withhold = (value: string | null) =>
    value !== null && ownLooksSecret(value) ? WITHHELD : value;
  return {
    ...parsed.data,
    items: parsed.data.items.map((item) => ({
      ...item,
      title: withhold(item.title),
      target: withhold(item.target),
      reason: withhold(item.reason)
    }))
  };
};

/** Parses a review file's text into a row, or says what is wrong in one line */
export const checkReview = (
  text: string,
  extra: { host: string; cost?: number; model?: string; own?: string }
): ReviewCheck => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      message:
        `failed: not JSON: ${error instanceof Error ? error.message : String(error)}`.split(
          '\n'
        )[0] as string
    };
  }
  const parsed = reviewFileSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // zod 4 words a missing field as a type mismatch; the line keeps saying "Required"
    const absent =
      issue?.code === 'invalid_type' &&
      issue.path.reduce<unknown>(
        (value, key) =>
          typeof value === 'object' && value !== null
            ? (value as Record<PropertyKey, unknown>)[key]
            : undefined,
        json
      ) === undefined;
    return {
      ok: false,
      message: `failed: ${issue?.path.join('.') || '(root)'}: ${absent ? 'Required' : (issue?.message ?? 'invalid')}`
    };
  }
  // The reviews table is readable with the desk's public key, so nothing secret may reach it
  const secret = findSecret(parsed.data);
  if (secret !== null) {
    return { ok: false, message: `failed: secret-like text in ${secret}` };
  }
  const own = toOwn(extra.own);
  return {
    ok: true,
    row: {
      host: extra.host,
      ...toReview(parsed.data),
      // Left out when null, so a row still stores before the migration adds the column
      ...(own === null ? {} : { own }),
      cost: extra.cost ?? null,
      model: extra.model ?? null
    }
  };
};
