import { generateSignature } from '@codeware/shared/util/signature';
import { z } from 'zod';

const OutcomeSchema = z.enum(['draft', 'published', 'deleted']);
export type Outcome = z.infer<typeof OutcomeSchema>;

/** One drafted post, as `devlog-covered.jsonl` keeps it */
export const CoveredRowSchema = z.object({
  postId: z.union([z.string(), z.number()]),
  prs: z.array(z.number().int().positive()),
  title: z.string(),
  /** When the draft was created, ISO */
  at: z.string(),
  /** What the cms said last time it was asked */
  outcome: OutcomeSchema.optional(),
  checkedAt: z.string().optional()
});
export type CoveredRow = z.infer<typeof CoveredRowSchema>;

export const COVERED_FILE = 'devlog-covered.jsonl';
export const DEVICE_ID_FILE = 'devlog-device-id';
export const USER_AGENT = 'cdwr-devlog';
export const REQUEST_TIMEOUT_MS = 30_000;

/** The title is the first `# ` line, the body what follows it */
export function parseDraft(text: string): { title: string; body: string } {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((line) => line.startsWith('# '));
  if (at === -1) {
    throw new Error('The draft needs a title: a first line starting with "# "');
  }
  const title = lines[at].slice(2).trim();
  if (!title) throw new Error('The draft title is empty');
  const rest = lines.slice(at + 1);
  if (rest.some((line) => /^\s{0,3}(```|~~~)/.test(line))) {
    throw new Error(
      'The draft has a code fence; a post takes code as a cms block that markdown cannot produce, so it would become a paragraph'
    );
  }
  const body = rest.join('\n').trim();
  if (!body) throw new Error('The draft has no body after its title');
  return { title, body };
}

/** `412,415` as numbers; each a positive integer, duplicates dropped */
export function parseCovers(value: string): number[] {
  const parts = value.split(',').map((part) => part.trim());
  const numbers = parts.map((part) => {
    if (!/^[1-9]\d*$/.test(part)) {
      throw new Error(
        `'${part}' is not a pull request number; expected positive integers separated by commas`
      );
    }
    return Number(part);
  });
  return [...new Set(numbers)];
}

/** Payload's `<collection slug> API-Key` format, for the agents collection */
export const authHeader = (key: string): string => `agents API-Key ${key}`;

export function requestHeaders(args: {
  key: string;
  signatureSecret?: string;
  deviceId: string;
  userAgent: string;
}): Record<string, string> {
  const { key, signatureSecret, deviceId, userAgent } = args;
  return {
    Authorization: authHeader(key),
    'Content-Type': 'application/json',
    ...(signatureSecret
      ? generateSignature({ deviceId, secret: signatureSecret, userAgent })
      : {})
  };
}

const base = (cmsUrl: string): string => cmsUrl.replace(/\/+$/, '');

export const createUrl = (cmsUrl: string): string =>
  `${base(cmsUrl)}/api/posts?draft=true`;

// No `draft=true`: Payload would swap in the newest draft version, so a
// published post edited later would read back as a draft. The post's own
// `_status` is what the outcome needs, and the agent can read a never-published
// draft all the same.
export const readUrl = (cmsUrl: string, id: string | number): string =>
  `${base(cmsUrl)}/api/posts/${encodeURIComponent(String(id))}?trash=true`;

export const accessUrl = (cmsUrl: string): string =>
  `${base(cmsUrl)}/api/access`;

/**
 * Payload treats an unknown key as no key at all, and an anonymous read of a
 * draft is a 404, so a wrong key would read every post as deleted. The key
 * must be allowed to create posts before any post is read back. `/api/access`
 * sanitizes a granted permission to `true` and keeps `{ permission, where }`
 * for a scoped one; both count. Not `/api/agents/me`: it re-reads the agent,
 * which only system users may do, so it answers 403 for an agent.
 */
export function assertCanDraft(status: number, body: unknown): void {
  const create = (
    body as { collections?: { posts?: { create?: unknown } } } | null
  )?.collections?.posts?.create;
  const granted =
    create === true ||
    (create as { permission?: unknown } | undefined)?.permission === true;
  if (status !== 200 || !granted) {
    throw new Error(
      `The cms does not let CMS_AGENT_API_KEY draft posts (${status})`
    );
  }
}

/** The cms sets the tenant and who drafted it, so neither is sent */
export const createBody = (
  title: string,
  content: Record<string, unknown>
): { title: string; content: Record<string, unknown>; _status: 'draft' } => ({
  title,
  content,
  _status: 'draft'
});

export function parseCovered(text: string): CoveredRow[] {
  const rows: CoveredRow[] = [];
  text.split('\n').forEach((line, index) => {
    if (!line.trim()) return;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      throw new Error(`Line ${index + 1} of the covered file is not JSON`);
    }
    const parsed = CoveredRowSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `Line ${index + 1} of the covered file is not a covered row: ${issue.path.join('.')}: ${issue.message}`
      );
    }
    rows.push(parsed.data);
  });
  return rows;
}

export const serializeCovered = (rows: CoveredRow[]): string =>
  rows.map((row) => `${JSON.stringify(row)}\n`).join('');

/**
 * What became of a post, from the cms's answer. Only 200 and 404 say anything:
 * a wrong key (401, 403) or an outage must never mark posts deleted.
 */
export function outcomeOf(status: number, body: unknown): Outcome {
  if (status === 404) return 'deleted';
  if (status !== 200) {
    throw new Error(`The cms answered ${status} when reading a post`);
  }
  const doc = (body ?? {}) as { _status?: unknown; deletedAt?: unknown };
  // A trashed post that was published is gone all the same
  if (doc.deletedAt) return 'deleted';
  return doc._status === 'published' ? 'published' : 'draft';
}
