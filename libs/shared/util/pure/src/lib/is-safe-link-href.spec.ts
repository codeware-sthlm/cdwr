import { describe, expect, it } from 'vitest';

import { isSafeLinkHref } from './is-safe-link-href';

describe('isSafeLinkHref', () => {
  it.each([
    '/licence',
    '/',
    'https://example.com/LICENSE',
    'HTTP://example.com'
  ])('accepts %s', (value) => {
    expect(isSafeLinkHref(value)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    ' JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    'licence',
    'mailto:a@b.com',
    '',
    null,
    undefined
  ])('refuses %s', (value) => {
    expect(isSafeLinkHref(value)).toBe(false);
  });
});
