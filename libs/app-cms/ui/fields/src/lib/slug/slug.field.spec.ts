import type { TextField } from 'payload';
import { describe, expect, it } from 'vitest';

import { slugField } from './slug.field';

describe('slugField', () => {
  it('sits in the sidebar by default', () => {
    const field = slugField({ sourceField: 'name' }) as TextField;
    expect(field.admin?.position).toBe('sidebar');
  });

  it('has no position when set to undefined', () => {
    const field = slugField({
      sourceField: 'name',
      position: undefined
    }) as TextField;
    expect(field.admin?.position).toBeUndefined();
  });
});
