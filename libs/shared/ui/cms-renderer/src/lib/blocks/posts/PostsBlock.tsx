'use client';

import { t } from '@codeware/shared/util/i18n';
import type {
  Post,
  PostsBlock as PostsBlockProps
} from '@codeware/shared/util/payload-types';
import { getExcerpt } from '@codeware/shared/util/payload-utils';
import { ChevronRightIcon } from 'lucide-react';

import { usePayload } from '../../providers/PayloadProvider';
import { handleAsRoute } from '../../utils/internal-link';

type Props = PostsBlockProps & {
  /**
   * Pre-fetched posts to render.
   * The app is responsible for fetching these server-side.
   */
  posts: Array<Post>;
};

function formatDate(dateString: string, locale: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Renders a listing of posts in Spotlight-style layout.
 *
 * Posts are pre-fetched server-side and passed in via the `posts` prop.
 * The block is configured via the Payload `posts` block fields (title, description, limit).
 */
export function PostsBlock({ title, description, posts }: Props) {
  const { locale, navigate } = usePayload();

  if (!posts.length) {
    return null;
  }

  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="text-core-headline text-4xl font-bold tracking-tight sm:text-5xl">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-6 text-base">{description}</p>
        )}
      </header>
      <div className="mt-16 sm:mt-20">
        <div className="md:border-border/40 space-y-16 md:border-l md:pl-6">
          {posts.map((post) => (
            <article key={post.id} className="md:grid md:grid-cols-4 md:gap-8">
              <div className="text-muted-foreground relative z-10 mb-3 flex items-center text-sm md:col-span-1">
                <time dateTime={post.createdAt}>
                  {formatDate(post.createdAt, locale)}
                </time>
              </div>
              <a
                href={`/posts/${post.slug}`}
                onClick={(e) => {
                  if (!handleAsRoute(e)) return;
                  navigate(`/posts/${post.slug}`);
                }}
                className="group relative md:col-span-3"
              >
                <span className="bg-accent absolute -inset-x-4 -inset-y-6 z-0 scale-95 opacity-0 transition group-hover:scale-100 group-hover:opacity-100 sm:-inset-x-6 sm:rounded-2xl" />
                <h2 className="text-core-headline group-hover:text-core-link relative z-10 text-base font-semibold tracking-tight">
                  {post.title}
                </h2>
                <p className="text-core-text relative z-10 mt-2 text-sm">
                  {getExcerpt(post)}
                </p>
                <div
                  aria-hidden="true"
                  className="text-core-link relative z-10 mt-4 flex items-center gap-2 text-sm font-medium"
                >
                  {t(locale, 'posts.readMore')}
                  <ChevronRightIcon className="size-3" />
                </div>
              </a>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
