import type { Category, Page } from '@codeware/shared/util/payload-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AuthenticatedPayload,
  PayloadRuntime
} from '../payload-runtime.types';

import { getPage } from './get-page';
import { getPageData } from './get-page-data';
import { getPosts } from './get-posts';

vi.mock('./get-page', () => ({ getPage: vi.fn() }));
vi.mock('./get-posts', () => ({ getPosts: vi.fn() }));
vi.mock('./get-tours', () => ({ getTours: vi.fn() }));

const runtime = {
  payload: { authenticatedUser: null } as unknown as AuthenticatedPayload,
  tenantConfig: null
} as PayloadRuntime;

const pageWith = (layout: Array<Record<string, unknown>>) =>
  ({ id: 1, slug: 'news', layout }) as unknown as Page;

describe('getPageData', () => {
  beforeEach(() => {
    vi.mocked(getPage).mockReset();
    vi.mocked(getPosts).mockReset();
    vi.mocked(getPosts).mockResolvedValue({ docs: [] } as never);
  });

  it('returns null when the page is not found', async () => {
    vi.mocked(getPage).mockResolvedValue(null as never);

    expect(await getPageData(runtime, 'missing')).toBeNull();
  });

  it('filters a posts listing on its categories', async () => {
    vi.mocked(getPage).mockResolvedValue(
      pageWith([
        {
          id: 'a',
          blockType: 'posts',
          limit: 4,
          categories: [1, { id: 2, name: 'Tech' } as Category]
        }
      ])
    );

    await getPageData(runtime, 'news');

    expect(getPosts).toHaveBeenCalledWith(
      runtime,
      expect.objectContaining({
        limit: 4,
        where: { categories: { in: [1, 2] } }
      })
    );
  });

  it('passes no where for a listing without categories', async () => {
    vi.mocked(getPage).mockResolvedValue(
      pageWith([{ id: 'a', blockType: 'posts', categories: [] }])
    );

    await getPageData(runtime, 'news');

    expect(vi.mocked(getPosts).mock.calls[0][1]).not.toHaveProperty('where');
  });

  it('keys the posts of each listing by block id', async () => {
    vi.mocked(getPage).mockResolvedValue(
      pageWith([
        { id: 'a', blockType: 'posts', categories: [1] },
        { id: 'b', blockType: 'posts' }
      ])
    );
    vi.mocked(getPosts).mockImplementation((async (_runtime, query) =>
      query?.where
        ? { docs: [{ id: 10 }] }
        : { docs: [{ id: 20 }] }) as typeof getPosts);

    const data = await getPageData(runtime, 'news');

    expect(data?.blocksData.posts).toEqual({
      a: [{ id: 10 }],
      b: [{ id: 20 }]
    });
  });
});
