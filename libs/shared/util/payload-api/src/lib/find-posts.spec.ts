import { beforeEach, describe, expect, it, vi } from 'vitest';

import { findPosts } from './find-posts';
import { invokeRequest } from './utils/invoke-request';

vi.mock('./utils/invoke-request', () => ({ invokeRequest: vi.fn() }));

const baseOptions = { apiUrl: 'https://cms.test', locale: 'en' as const };

describe('findPosts', () => {
  beforeEach(() => {
    vi.mocked(invokeRequest).mockReset();
    vi.mocked(invokeRequest).mockResolvedValue({
      data: [],
      count: 0,
      status: 200
    });
  });

  it('sorts by creation date without a category filter', async () => {
    await findPosts({ ...baseOptions, limit: 3 });

    expect(invokeRequest).toHaveBeenCalledWith(
      'posts',
      expect.objectContaining({
        method: 'GET',
        query: 'sort=-createdAt',
        limit: 3
      })
    );
  });

  it('adds no filter for an empty category list', async () => {
    await findPosts({ ...baseOptions, categories: [] });

    expect(vi.mocked(invokeRequest).mock.calls[0][1]).toMatchObject({
      query: 'sort=-createdAt'
    });
  });

  it('adds one indexed where clause per category id', async () => {
    await findPosts({ ...baseOptions, categories: [4, 7] });

    expect(vi.mocked(invokeRequest).mock.calls[0][1]).toMatchObject({
      query:
        'sort=-createdAt&where[categories][in][0]=4&where[categories][in][1]=7'
    });
  });

  it('does not pass the categories on as a request option', async () => {
    await findPosts({ ...baseOptions, categories: [4] });

    expect(vi.mocked(invokeRequest).mock.calls[0][1]).not.toHaveProperty(
      'categories'
    );
  });
});
