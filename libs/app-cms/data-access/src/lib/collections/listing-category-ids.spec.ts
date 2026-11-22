import type { Category } from '@codeware/shared/util/payload-types';
import { describe, expect, it } from 'vitest';

import { listingCategoryIds } from './listing-category-ids';

const category = (id: number) => ({ id, name: `c${id}` }) as Category;

describe('listingCategoryIds', () => {
  it('returns ids as they are', () => {
    expect(listingCategoryIds([1, 2])).toEqual([1, 2]);
  });

  it('reads the id of populated categories', () => {
    expect(listingCategoryIds([category(3), category(4)])).toEqual([3, 4]);
  });

  it('handles ids and objects mixed', () => {
    expect(listingCategoryIds([1, category(2)])).toEqual([1, 2]);
  });

  it('returns no ids for null, undefined or an empty list', () => {
    expect(listingCategoryIds(null)).toEqual([]);
    expect(listingCategoryIds(undefined)).toEqual([]);
    expect(listingCategoryIds([])).toEqual([]);
  });
});
