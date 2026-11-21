import { describe, expect, it } from 'vitest';

import { shareDashboardUrl } from './share-dashboard-url';

describe('shareDashboardUrl', () => {
  it.each([
    [
      'plain',
      'https://umami.example.com',
      'abc-123_X',
      'https://umami.example.com/share/abc-123_X'
    ],
    [
      'trailing slash',
      'https://umami.example.com/',
      'abc',
      'https://umami.example.com/share/abc'
    ],
    [
      'several trailing slashes',
      'https://umami.example.com//',
      'abc',
      'https://umami.example.com/share/abc'
    ],
    ['empty slug', 'https://umami.example.com', '', null],
    ['undefined slug', 'https://umami.example.com', undefined, null],
    ['null slug', 'https://umami.example.com', null, null],
    [
      'slug needing encoding',
      'https://umami.example.com',
      'a b/c',
      'https://umami.example.com/share/a%20b%2Fc'
    ]
  ])('%s', (_name, umamiUrl, shareId, expected) => {
    expect(shareDashboardUrl(umamiUrl, shareId)).toBe(expected);
  });
});
