import type { Post } from '@codeware/shared/util/payload-types';
import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { PostsBlock } from './PostsBlock';

const meta = {
  title: 'cms-renderer/PostsBlock',
  component: PostsBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof PostsBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const makePost = (
  id: number,
  title: string,
  slug: string,
  date: string,
  excerpt: string
): Post =>
  ({
    id,
    title,
    slug,
    createdAt: date,
    updatedAt: date,
    content: {
      root: {
        type: 'root',
        version: 1,
        children: [
          {
            type: 'paragraph',
            version: 1,
            children: [{ type: 'text', version: 1, text: excerpt }],
            direction: 'ltr',
            format: '',
            indent: 0
          }
        ],
        direction: 'ltr',
        format: '',
        indent: 0
      }
    }
  }) as unknown as Post;

const posts: Array<Post> = [
  makePost(
    1,
    'Building a Design System with Nx',
    'building-design-system-nx',
    '2024-11-12T10:00:00.000Z',
    'A design system brings consistency and speed to product development. In this post we walk through how we set up a scalable component library using Nx, Storybook, and shadcn/ui.'
  ),
  makePost(
    2,
    'Multi-Tenant CMS with Payload v3',
    'multi-tenant-cms-payload-v3',
    '2024-09-04T08:30:00.000Z',
    'Payload v3 unlocks a new level of flexibility for building multi-tenant platforms. We explore how to scope collections, media, and access control to individual tenants without duplicating any code.'
  ),
  makePost(
    3,
    'Type-Safe APIs with tRPC and Hono',
    'type-safe-apis-trpc-hono',
    '2024-07-20T14:00:00.000Z',
    'Combining tRPC with Hono gives you end-to-end type safety with minimal overhead. This post covers the setup, routing conventions, and how to share types between the server and the React client.'
  )
];

export const TitleOnly: Story = {
  name: 'Title only (no description)',
  args: {
    blockType: 'posts',
    title: 'Latest posts',
    limit: 3,
    posts
  }
};

export const SinglePost: Story = {
  name: 'Single post',
  args: {
    blockType: 'posts',
    title: 'Featured',
    limit: 1,
    posts: [posts[0]]
  }
};

const a11yArgs = { blockType: 'posts' as const, title: 'From the blog', posts };

export const ShadcnLight = a11yStory({ args: a11yArgs }, 'shadcn', 'light');
export const ShadcnDark = a11yStory({ args: a11yArgs }, 'shadcn', 'dark');
export const PayloadAdminLight = a11yStory(
  { args: a11yArgs },
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(
  { args: a11yArgs },
  'payload-admin',
  'dark'
);
export const SpotlightLight = a11yStory(
  { args: a11yArgs },
  'spotlight',
  'light'
);
export const SpotlightDark = a11yStory({ args: a11yArgs }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args: a11yArgs }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args: a11yArgs }, 'codeware', 'dark');
