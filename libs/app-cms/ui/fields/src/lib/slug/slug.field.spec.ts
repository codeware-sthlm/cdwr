import type { TextField } from 'payload';
import { describe, expect, it } from 'vitest';

import { slugField } from './slug.field';

describe('slugField', () => {
  it('sits in the main column', () => {
    const field = slugField({ sourceField: 'name' }) as TextField;
    expect(field.admin?.position).toBeUndefined();
  });
});
