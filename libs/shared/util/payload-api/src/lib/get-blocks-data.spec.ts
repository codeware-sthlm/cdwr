import type { Category, Page } from '@codeware/shared/util/payload-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { findPosts } from './find-posts';
import { findTours } from './find-tours';
import { getBlocksData } from './get-blocks-data';

vi.mock('./find-posts', () => ({ findPosts: vi.fn() }));
vi.mock('./find-tours', () => ({ findTours: vi.fn() }));

const options = { apiUrl: 'https://cms.test', locale: 'en' as const };

const postsBlock = (
  id: string,
  extra: Record<string, unknown> = {}
): NonNullable<Page['layout']>[number] =>
  ({ id, blockType: 'posts', ...extra }) as NonNullable<Page['layout']>[number];

describe('getBlocksData', () => {
  beforeEach(() => {
    vi.mocked(findPosts).mockReset();
    vi.mocked(findTours).mockReset();
    vi.mocked(findPosts).mockResolvedValue([]);
    vi.mocked(findTours).mockResolvedValue([]);
  });

  it('returns nothing for a layout without listing blocks', async () => {
    expect(await getBlocksData(null, options)).toEqual({});
    expect(findPosts).not.toHaveBeenCalled();
  });

  it('passes the ids of populated categories', async () => {
    await getBlocksData(
      [
        postsBlock('a', {
          limit: 5,
          categories: [
            { id: 1, name: 'News' } as Category,
            { id: 2, name: 'Tech' } as Category
          ]
        })
      ],
      options
    );

    expect(findPosts).toHaveBeenCalledWith({
      ...options,
      limit: 5,
      categories: [1, 2]
    });
  });

  it('passes category ids as they are', async () => {
    await getBlocksData([postsBlock('a', { categories: [3, 8] })], options);

    expect(findPosts).toHaveBeenCalledWith(
      expect.objectContaining({ categories: [3, 8] })
    );
  });

  it('passes no categories when the block has none', async () => {
    await getBlocksData(
      [
        postsBlock('a', { categories: null }),
        postsBlock('b', { categories: [] })
      ],
      options
    );

    expect(findPosts).toHaveBeenCalledTimes(2);
    for (const [args] of vi.mocked(findPosts).mock.calls) {
      expect(args).not.toHaveProperty('categories');
    }
  });

  it('keys each posts block by its own id', async () => {
    vi.mocked(findPosts).mockImplementation(async ({ categories }) =>
      categories ? [{ id: 100 } as never] : [{ id: 200 } as never]
    );

    const data = await getBlocksData(
      [postsBlock('a', { categories: [1] }), postsBlock('b')],
      options
    );

    expect(data.posts).toEqual({ a: [{ id: 100 }], b: [{ id: 200 }] });
  });
});
