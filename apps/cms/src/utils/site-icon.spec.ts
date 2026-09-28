import { faviconSvg, fitMark, svgMark } from './site-icon';

const mark =
  '<svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 20 10" fill="currentColor"><path d="M0 0h1"></path></svg>';

describe('faviconSvg', () => {
  it('restores every camelCase attribute an older mark was stored with', () => {
    const svg = faviconSvg(
      '<svg viewbox="0 0 2 1"><defs><linearGradient id="g" gradientunits="userSpaceOnUse" gradienttransform="rotate(9)"></linearGradient><clipPath id="c" clippathunits="objectBoundingBox"></clipPath><mask id="m" maskunits="userSpaceOnUse"></mask></defs></svg>'
    );

    expect(svg).toContain('gradientUnits=');
    expect(svg).toContain('gradientTransform=');
    expect(svg).toContain('clipPathUnits=');
    expect(svg).toContain('maskUnits=');
  });

  it('restores the viewBox case a standalone reader needs', () => {
    expect(faviconSvg(mark)).toContain('viewBox="0 0 20 10"');
    expect(faviconSvg(mark)).not.toContain('viewbox=');
  });

  // A browser tab has no page text for currentColor to follow
  it('gives the mark a colour for each scheme', () => {
    const svg = faviconSvg(mark) ?? '';

    expect(svg).toMatch(/<svg[^>]*><style>:root\{color:#1f2937\}/);
    expect(svg).toContain('@media (prefers-color-scheme:dark)');
  });

  it('holds a bitmap to one scheme, which it cannot follow', () => {
    expect(faviconSvg(mark, 'light')).not.toContain('@media');
  });

  it('refuses markup that is not an SVG', () => {
    expect(faviconSvg('<div></div>')).toBeNull();
  });
});

describe('fitMark', () => {
  it('keeps a wide mark wide inside the square', () => {
    expect(fitMark(faviconSvg(mark) ?? '', 32)).toEqual({
      width: 32,
      height: 16
    });
  });

  it('keeps a tall mark tall', () => {
    expect(fitMark('<svg viewBox="0 0 10 20">', 32)).toEqual({
      width: 16,
      height: 32
    });
  });

  it('takes a mark without a viewBox as square', () => {
    expect(fitMark('<svg>', 32)).toEqual({ width: 32, height: 32 });
  });
});

describe('svgMark', () => {
  it('serves only a mark stated as SVG', () => {
    expect(svgMark({ source: 'svg', svgCode: mark })).toBe(mark);
    expect(svgMark({ source: 'upload', fileUrl: '/m.png' })).toBeNull();
    expect(svgMark(null)).toBeNull();
  });
});
