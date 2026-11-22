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

export const META_TITLE_MAX = 60;
export const META_DESCRIPTION_MIN = 50;
export const META_DESCRIPTION_MAX = 160;
export const DEVLOG_CATEGORY = 'devlog';

/** The next non-blank line from `from`, and the line after it */
function nextLine(
  lines: string[],
  from: number
): { text: string; next: number } {
  let at = from;
  while (at < lines.length && !lines[at].trim()) at++;
  return { text: lines[at] ?? '', next: at + 1 };
}

/**
 * The title is the first `# ` line. The two lines after it, `Meta title:` and
 * `Description:`, are the SEO fields; the body is what follows them.
 */
export function parseDraft(text: string): {
  title: string;
  metaTitle: string;
  metaDescription: string;
  body: string;
} {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((line) => line.startsWith('# '));
  if (at === -1) {
    throw new Error('The draft needs a title: a first line starting with "# "');
  }
  const title = lines[at].slice(2).trim();
  if (!title) throw new Error('The draft title is empty');

  const metaLine = nextLine(lines, at + 1);
  if (!metaLine.text.startsWith('Meta title:')) {
    throw new Error(
      'The draft needs a "Meta title:" line right after its title'
    );
  }
  const metaTitle = metaLine.text.slice('Meta title:'.length).trim();
  if (!metaTitle) throw new Error('The draft meta title is empty');
  if (metaTitle.length > META_TITLE_MAX) {
    throw new Error(
      `The draft meta title is ${metaTitle.length} characters; the most is ${META_TITLE_MAX}`
    );
  }

  const descriptionLine = nextLine(lines, metaLine.next);
  if (!descriptionLine.text.startsWith('Description:')) {
    throw new Error(
      'The draft needs a "Description:" line right after its "Meta title:" line'
    );
  }
  const metaDescription = descriptionLine.text
    .slice('Description:'.length)
    .trim();
  if (!metaDescription) throw new Error('The draft description is empty');
  if (
    metaDescription.length < META_DESCRIPTION_MIN ||
    metaDescription.length > META_DESCRIPTION_MAX
  ) {
    throw new Error(
      `The draft description is ${metaDescription.length} characters; it must be ${META_DESCRIPTION_MIN} to ${META_DESCRIPTION_MAX}`
    );
  }

  const rest = lines.slice(descriptionLine.next);
  if (rest.some((line) => /^\s{0,3}(```|~~~)/.test(line))) {
    throw new Error(
      'The draft has a code fence; a post takes code as a cms block that markdown cannot produce, so it would become a paragraph'
    );
  }
  const body = rest.join('\n').trim();
  if (!body) throw new Error('The draft has no body after its description');
  return { title, metaTitle, metaDescription, body };
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

/** The devlog category is looked up by slug; its id differs per database */
export const categoryUrl = (cmsUrl: string): string =>
  `${base(cmsUrl)}/api/categories?${new URLSearchParams({
    'where[slug][equals]': DEVLOG_CATEGORY,
    limit: '1',
    depth: '0'
  }).toString()}`;

export function categoryIdFrom(status: number, body: unknown): string | number {
  if (status !== 200) {
    throw new Error(
      `The cms answered ${status} when reading the devlog category`
    );
  }
  const id = (body as { docs?: Array<{ id?: unknown }> } | null)?.docs?.[0]?.id;
  if (typeof id !== 'string' && typeof id !== 'number') {
    throw new Error(
      `The cms has no category with the slug ${DEVLOG_CATEGORY} in the agent's workspace. Apply the cdwr.io site definition, which seeds it.`
    );
  }
  return id;
}

/** The cms sets the tenant and who drafted it, so neither is sent */
export const createBody = (args: {
  title: string;
  content: Record<string, unknown>;
  metaTitle: string;
  metaDescription: string;
  categoryId: string | number;
}): {
  title: string;
  content: Record<string, unknown>;
  meta: { title: string; description: string };
  categories: Array<string | number>;
  _status: 'draft';
} => ({
  title: args.title,
  content: args.content,
  meta: { title: args.metaTitle, description: args.metaDescription },
  categories: [args.categoryId],
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
