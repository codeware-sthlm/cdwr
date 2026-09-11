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
  name: {
    en: 'The latest writing',
    sv: 'Det senast skrivna'
  },
  summary: {
    en: 'The latest posts, newest first.',
    sv: 'De senaste inläggen, nyast först.'
  },
  whenToUse: {
    en: 'On a page that should end with what is new rather than with a claim. The heading and the count are the editor\u2019s; the entries themselves are fetched for the page when it is served, so the list is never edited and never out of date.',
    sv: 'På en sida som ska sluta med det senaste i stället för med ett påstående. Rubriken och antalet bestämmer redaktören; inläggen hämtas för sidan när den levereras, så listan redigeras aldrig och blir aldrig inaktuell.'
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
