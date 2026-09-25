import { getId } from '@codeware/app-cms/util/misc';
import type { Post } from '@codeware/shared/util/payload-types';
import type { Payload, TypedLocale } from 'payload';

export type PostData = Pick<
  Post,
  'authors' | 'categories' | 'content' | 'createdAt' | 'tenant' | 'title'
> & {
  slug: string;
  /** Optional, unlike on the document, so existing callers state neither */
  heroImage?: Post['heroImage'];
  visibility?: Post['visibility'];
};

/**
 * Ensure that a post exist with the given slug.
 *
 * @param payload - Payload instance
 * @param data - Post data
 * @param options - Seed options
 * @returns The created post or the id if the post exists
 */
export async function ensurePost(
  payload: Payload,
  data: PostData,
  options: {
    locale: TypedLocale;
    transactionID: string | number | undefined;
    /** Written on create only; an existing document is never claimed */
    managedBy?: string;
  }
): Promise<Post | number> {
  const { locale, transactionID, managedBy } = options;
  const {
    authors,
    categories,
    content,
    createdAt,
    heroImage,
    slug,
    tenant,
    title,
    visibility
  } = data;

  // Scoped to the tenant, like every sibling helper: a slug is unique within
  // a workspace, not across the platform, so an unscoped lookup hands one
  // tenant's post back to another and the second is silently skipped
  const posts = await payload.find({
    collection: 'posts',
    where: {
      and: [
        { slug: { equals: slug } },
        tenant ? { tenant: { in: [getId(tenant)] } } : {}
      ]
    },
    depth: 0,
    req: { transactionID },
    limit: 1
  });

  if (posts.totalDocs) {
    return posts.docs[0].id;
  }

  // No post found, create one

  const post = await payload.create({
    collection: 'posts',
    data: {
      ...(managedBy ? { managedBy } : {}),
      authors,
      categories,
      content,
      createdAt,
      heroImage,
      slug,
      tenant,
      title,
      // Public unless the caller says otherwise: seeded demo content is
      // public, but a definition may state a members-only post
      visibility: visibility ?? 'public',
      _status: 'published'
    },
    context: { seedAction: true },
    locale,
    req: { transactionID }
  });

  return post;
}
