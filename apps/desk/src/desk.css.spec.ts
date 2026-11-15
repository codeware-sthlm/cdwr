import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const css = readFileSync(
  fileURLToPath(new URL('./desk.css', import.meta.url)),
  'utf8'
);

describe('desk.css', () => {
  it('is dark only: the root sets the dark color scheme', () => {
    const root = /:root\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(root).toMatch(/color-scheme:\s*dark\s*;/);
  });

  it('has no light scheme to follow', () => {
    expect(css).not.toMatch(/prefers-color-scheme:\s*light/);
  });
});
