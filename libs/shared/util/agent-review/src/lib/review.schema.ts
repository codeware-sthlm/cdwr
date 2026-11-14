import { z } from 'zod';

const text = z.string().min(1);
const ticket = z.string().regex(/^COD-\d+$/);
const evidence = z.array(text);

const actionSchema = z.object({ ticket, action: text, why: text, evidence });

const severity = z.enum(['blocks', 'note']);

const findingSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+:COD-\d+:[0-9a-f]{8}$/),
    ticket,
    kind: text,
    /** What the finding is about, as `findingId` keyed it; absent on older rows */
    key: text.optional(),
    severity,
    evidence,
    fix: text
  })
  // The id's middle part is the ticket it belongs to
  .refine((f) => f.id.split(':')[1] === f.ticket, {
    message: 'id must carry the same ticket',
    path: ['id']
  });

/** Lowercase, runs of other characters become one dash */
const slugKind = (kind: string) =>
  kind
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** A key shared by every finding of a kind and ticket would merge them, so it must name a subject */
const subject = text.refine((key) => key.trim() !== '' && key.trim() !== '-', {
  message: 'key must name a specific subject'
});

/** A finding as the review run writes it: no id, the check derives it */
const fileFindingSchema = z.object({
  ticket,
  kind: text.transform(slugKind).pipe(text),
  key: subject,
  severity,
  evidence,
  fix: text
});

const staleSchema = z.object({ ticket, why: text, evidence });

const suggestionSchema = z.object({ ticket, why: text });

/** What a review run hands the desk: a brief and what needs attention */
export const reviewSchema = z.object({
  brief: text,
  actions: z.array(actionSchema),
  findings: z.array(findingSchema),
  stale: z.array(staleSchema),
  suggestions: z.array(suggestionSchema).max(3)
});

/** What the review run writes to its file: findings carry no id */
export const reviewFileSchema = z.object({
  brief: text,
  actions: z.array(actionSchema),
  findings: z.array(fileFindingSchema),
  stale: z.array(staleSchema),
  suggestions: z.array(suggestionSchema).max(3)
});

export type Review = z.infer<typeof reviewSchema>;
export type ReviewFile = z.infer<typeof reviewFileSchema>;
export type ReviewAction = z.infer<typeof actionSchema>;
export type ReviewFinding = z.infer<typeof findingSchema>;
export type ReviewStale = z.infer<typeof staleSchema>;
export type ReviewSuggestion = z.infer<typeof suggestionSchema>;

/** `<kind slug>:<ticket>:<8 hex>`, stable for the same finding; pure JS since the desk runs in the browser */
export const findingId = (kind: string, ticketId: string, body: string) => {
  const slug = slugKind(kind);
  // FNV-1a, 32 bit
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(`${kind}|${ticketId}|${body}`)) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return `${slug}:${ticketId}:${hash.toString(16).padStart(8, '0')}`;
};

/** The stored review: each finding gets its id from kind, ticket and key; a repeated id is dropped, the first wins */
export const toReview = (file: ReviewFile): Review => {
  const seen = new Set<string>();
  const findings: ReviewFinding[] = [];
  for (const finding of file.findings) {
    const id = findingId(finding.kind, finding.ticket, finding.key);
    if (seen.has(id)) continue;
    seen.add(id);
    findings.push({ id, ...finding });
  }
  return { ...file, findings };
};
