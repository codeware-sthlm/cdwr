import type {
  Post,
  PostsBlock as PostsBlockProps
} from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

/** Paired with the example block's id, the way a page pairs its own fetch. */
const ID = 'gallery-posts';

const paragraph = (text: string) =>
  ({
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: [
        {
          type: 'paragraph',
          version: 1,
          direction: 'ltr',
          format: '',
          indent: 0,
          children: [{ type: 'text', version: 1, text }]
        }
      ]
    }
    // The editor state is typed by the configured Lexical features, which a
    // fixture cannot satisfy without importing the editor itself
  }) as unknown as never;

const post = (
  id: number,
  slug: string,
  title: string,
  createdAt: string,
  excerpt: string
): Post =>
  ({
    id,
    slug,
    title,
    createdAt,
    updatedAt: createdAt,
    content: paragraph(excerpt)
  }) as unknown as Post;

export const postsGallery: BlockGalleryDoc<PostsBlockProps> = {
  summary: {
    en: 'The latest posts, newest first.',
    sv: 'De senaste inläggen, nyast först.'
  },
  whenToUse: {
    en: 'For showing the latest posts on a page, such as the start page or a news page. The heading and the number of posts are the editor\u2019s choice. The posts are fetched when the page is served, so the list stays up to date without anyone editing it.',
    sv: 'För att visa de senaste inläggen på en sida, till exempel startsidan eller en nyhetssida. Redaktören anger rubriken och hur många inlägg som visas. Inläggen hämtas när sidan levereras, så listan hålls aktuell utan att någon redigerar den.'
  },
  example: {
    blockType: 'posts',
    id: ID,
    title: 'Writing',
    description: 'Notes on building the platform, newest first.',
    limit: 3
  },
  exampleData: {
    posts: {
      [ID]: [
        post(
          1,
          'themes-without-a-deploy',
          'Themes without a deploy',
          '2026-08-14T09:00:00.000Z',
          'A tenant picks its palette in the admin and the site answers on the next request. No build, no release, no stylesheet written by hand.'
        ),
        post(
          2,
          'one-renderer-two-frameworks',
          'One renderer, two frameworks',
          '2026-07-02T09:00:00.000Z',
          'The same block components draw a Next site and a Remix one, which is the plainest test of whether the content really is separate from the app.'
        ),
        post(
          3,
          'multi-tenant-from-the-first-line',
          'Multi-tenant from the first line',
          '2026-05-20T09:00:00.000Z',
          'Tenancy decided at the boundary rather than bolted on: every query is scoped by the identity that asked, not by a filter someone remembered to add.'
        )
      ]
    }
  }
};
