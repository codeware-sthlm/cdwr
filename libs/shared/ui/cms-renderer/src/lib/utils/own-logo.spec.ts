import { resolveOwnLogo } from './OwnLogo';

describe('resolveOwnLogo', () => {
  it('draws from SVG code', () => {
    expect(resolveOwnLogo({ source: 'svg', svgCode: '<svg></svg>' })).toEqual({
      svgCode: '<svg></svg>'
    });
  });

  it('draws from a loaded upload', () => {
    expect(
      resolveOwnLogo({ source: 'upload', file: { url: '/m.png' } })
    ).toEqual({ src: '/m.png' });
  });

  // The regression it exists for: a card with only an icon has an empty logo
  // group, and asking the element instead of the data hid the icon
  it('finds nothing in an empty or half-stated logo', () => {
    expect(resolveOwnLogo(null)).toBeNull();
    expect(resolveOwnLogo({})).toBeNull();
    expect(resolveOwnLogo({ source: 'svg', svgCode: '' })).toBeNull();
    expect(resolveOwnLogo({ source: 'upload', file: 12 })).toBeNull();
  });
});
