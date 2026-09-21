import { getId } from '@codeware/app-cms/util/misc';
import type { Post } from '@codeware/shared/util/payload-types';
import type { Payload, TypedLocale } from 'payload';

export type PostData = Pick<
  Post,
  'authors' | 'categories' | 'content' | 'createdAt' | 'tenant' | 'title'
> & {
  slug: string;
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
  options: { locale: TypedLocale; transactionID: string | number | undefined }
): Promise<Post | number> {
  const { locale, transactionID } = options;
  const { authors, categories, content, createdAt, slug, tenant, title } = data;

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
      authors,
      categories,
      content,
      createdAt,
      slug,
      tenant,
      title,
      // Seeded content is demo content; nothing here is member-restricted
      visibility: 'public',
      _status: 'published'
    },
    context: { seedAction: true },
    locale,
    req: { transactionID }
  });

  return post;
}
