import type { FieldHookArgs } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { formatSlug } from './format-slug';

const args = (fieldNames: string[], data: Record<string, unknown>) =>
  ({
    value: undefined,
    data,
    originalDoc: undefined,
    // Payload flattens unnamed tabs and rows into flattenedFields
    collection: { flattenedFields: fieldNames.map((name) => ({ name })) },
    req: { payload: { logger: { error: vi.fn() } } }
  }) as unknown as FieldHookArgs;

describe('formatSlug', () => {
  it('formats a slug from a source field that sits in a tab', () => {
    expect(
      formatSlug('name')(args(['name', 'slug'], { name: 'Acme Inc' }))
    ).toBe('acme-inc');
  });

  it('throws on a source field the collection does not have', () => {
    expect(() => formatSlug('title')(args(['name'], {}))).toThrow(
      "fallback field 'title'"
    );
  });
});
