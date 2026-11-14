import {
  type Review,
  reviewFileSchema,
  toReview
} from '@codeware/shared/util/agent-review';

/** The reviews table row the desk reads; `id` and `at` are the database's */
export interface ReviewRow extends Review {
  host: string;
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

/** Parses a review file's text into a row, or says what is wrong in one line */
export const checkReview = (
  text: string,
  extra: { host: string; cost?: number; model?: string }
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
    return {
      ok: false,
      message: `failed: ${issue?.path.join('.') || '(root)'}: ${issue?.message ?? 'invalid'}`
    };
  }
  // The reviews table is readable with the desk's public key, so nothing secret may reach it
  const secret = findSecret(parsed.data);
  if (secret !== null) {
    return { ok: false, message: `failed: secret-like text in ${secret}` };
  }
  return {
    ok: true,
    row: {
      host: extra.host,
      ...toReview(parsed.data),
      cost: extra.cost ?? null,
      model: extra.model ?? null
    }
  };
};
