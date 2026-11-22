import type { Category } from '@codeware/shared/util/payload-types';
import { describe, expect, it, vi } from 'vitest';

import type {
  AuthenticatedPayload,
  PayloadRuntime
} from '../payload-runtime.types';

import { getPostsListingPath } from './get-posts-listing-path';

type PageStub = {
  slug: string | null;
  layout: Array<{
    blockType: string;
    categories?: Array<number | Category> | null;
  }>;
};

/** A runtime whose `payload.find` answers with the given pages. */
function makeRuntime(docs: Array<PageStub>): PayloadRuntime {
  return {
    payload: {
      authenticatedUser: null,
      asVisitor: false,
      find: vi.fn().mockResolvedValue({ docs })
    } as unknown as AuthenticatedPayload,
    tenantConfig: null
  };
}

const posts = (categories?: Array<number | Category> | null) => ({
  blockType: 'posts',
  categories
});

const pathFor = (
  docs: Array<PageStub>,
  categories: Array<number | Category> | null
) => getPostsListingPath(makeRuntime(docs), { categories });

describe('getPostsListingPath', () => {
  it('prefers a matching filtered listing over an earlier unfiltered one', async () => {
    const path = await pathFor(
      [
        { slug: 'all', layout: [posts()] },
        { slug: 'news', layout: [posts([2, 3])] }
      ],
      [3]
    );

    expect(path).toBe('/news');
  });

  it('falls back to the first unfiltered listing when none match', async () => {
    const path = await pathFor(
      [
        { slug: 'tech', layout: [posts([9])] },
        { slug: 'all', layout: [posts([])] },
        { slug: 'everything', layout: [posts(null)] }
      ],
      [1]
    );

    expect(path).toBe('/all');
  });

  it('returns null when only non-matching filtered listings exist', async () => {
    const path = await pathFor([{ slug: 'tech', layout: [posts([9])] }], [1]);

    expect(path).toBeNull();
  });

  it('returns null when no page has a posts block', async () => {
    expect(await pathFor([], [1])).toBeNull();
    expect(
      await pathFor([{ slug: 'about', layout: [{ blockType: 'text' }] }], [1])
    ).toBeNull();
  });

  it('reads categories given as objects on both sides', async () => {
    const path = await pathFor(
      [
        {
          slug: 'news',
          layout: [posts([{ id: 5, name: 'News' } as Category])]
        }
      ],
      [{ id: 5, name: 'News' } as Category]
    );

    expect(path).toBe('/news');
  });

  it('lists a post without categories only on an unfiltered listing', async () => {
    const path = await pathFor(
      [
        { slug: 'news', layout: [posts([1])] },
        { slug: 'all', layout: [posts()] }
      ],
      null
    );

    expect(path).toBe('/all');
  });
});
