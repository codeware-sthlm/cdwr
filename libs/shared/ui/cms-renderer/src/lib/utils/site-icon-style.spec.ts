import { describe, expect, it } from 'vitest';

import { siteIconStyle } from './site-icon-style';

describe('siteIconStyle', () => {
  it('leaves an icon in the text colour alone', () => {
    expect(siteIconStyle({ style: 'own' })).toBe('flex shrink-0');
  });

  it('colours the icon with the link colour for brand', () => {
    expect(siteIconStyle({ style: 'brand' })).toBe(
      'flex shrink-0 text-core-link'
    );
  });

  it('dims the icon for muted', () => {
    expect(siteIconStyle({ style: 'muted' })).toBe(
      'flex shrink-0 text-muted-foreground'
    );
  });
});
