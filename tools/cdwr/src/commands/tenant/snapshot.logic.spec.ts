import {
  type RoutedDefinition,
  fileName,
  findStrips,
  hostFolder,
  isRoutedDefinition,
  parseRoutes,
  routesOf,
  shotsOf
} from './snapshot.logic';

const definition = (landing?: string): RoutedDefinition => ({
  pages: [{ slug: 'blocks' }, { slug: 'home' }, { slug: 'start' }],
  ...(landing && {
    siteSettings: { general: { landingPage: { lookupSlug: landing } } }
  })
});

describe('isRoutedDefinition', () => {
  it.each([
    [{ pages: [{ slug: 'a' }] }, true],
    [{ pages: [] }, true],
    [{ pages: [{ name: 'no slug' }] }, false],
    [{ page: [] }, false],
    [null, false]
  ])('reads %j as %s', (value, expected) => {
    expect(isRoutedDefinition(value)).toBe(expected);
  });
});

describe('routesOf', () => {
  it('serves the landing page at / and first', () => {
    expect(routesOf(definition('home'))).toEqual(['/', '/blocks', '/start']);
  });

  it('keeps every page under its slug when no landing page is stated', () => {
    expect(routesOf(definition())).toEqual(['/blocks', '/home', '/start']);
  });
});

describe('parseRoutes', () => {
  it.each([
    ['/, /studio', ['/', '/studio']],
    ['studio,architecture', ['/studio', '/architecture']],
    [' , /start ,', ['/start']]
  ])('reads %j', (value, expected) => {
    expect(parseRoutes(value)).toEqual(expected);
  });
});

describe('shotsOf', () => {
  it('takes every route in every setting, routes varying fastest', () => {
    const shots = shotsOf(
      ['/', '/a'],
      ['spotlight'],
      ['light', 'dark'],
      ['phone']
    );

    expect(
      shots.map(({ route, colorScheme }) => `${colorScheme} ${route}`)
    ).toEqual(['light /', 'light /a', 'dark /', 'dark /a']);
  });
});

describe('fileName', () => {
  it.each([
    ['/', 'index--codeware-dark-phone.png'],
    ['/studio', 'studio--codeware-dark-phone.png'],
    ['/posts/first/', 'posts-first--codeware-dark-phone.png'],
    // Nothing that could leave the output folder survives into the name
    ['..\\..\\outside', 'outside--codeware-dark-phone.png'],
    ['/../../etc', 'etc--codeware-dark-phone.png']
  ])('names %s', (route, expected) => {
    expect(
      fileName({
        route,
        theme: 'codeware',
        colorScheme: 'dark',
        viewport: 'phone'
      })
    ).toBe(expected);
  });
});

describe('hostFolder', () => {
  it('turns a host with a port into a folder name', () => {
    expect(hostFolder('http://localhost:3000/')).toBe('localhost-3000');
  });
});

describe('findStrips', () => {
  const section = (band: string, top: number, bottom: number) =>
    ({ kind: 'section', band, top, bottom }) as const;
  const footer = (top: number) => ({ kind: 'footer', top }) as const;

  it('finds page showing between two bands', () => {
    expect(
      findStrips([section('subtle', 0, 400), section('gradient', 464, 900)])
    ).toEqual([{ above: 'subtle', below: 'gradient', px: 64 }]);
  });

  it('finds page showing under a closing band, before the footer', () => {
    expect(findStrips([section('gradient', 0, 500), footer(564)])).toEqual([
      { above: 'gradient', below: 'footer', px: 64 }
    ]);
  });

  it('passes bands that meet, allowing for rounding', () => {
    expect(
      findStrips([
        section('subtle', 0, 400),
        section('strong', 400.6, 800),
        footer(800)
      ])
    ).toEqual([]);
  });

  // A section with no band is spaced like any content, on either side
  it('leaves the spacing around a section without a band alone', () => {
    expect(
      findStrips([
        section('none', 0, 200),
        section('subtle', 296, 700),
        section('none', 796, 900),
        footer(964)
      ])
    ).toEqual([]);
  });
});
