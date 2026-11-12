import {
  SITE_GATE_COOKIE,
  verifySiteGateToken
} from '@codeware/shared/util/site-gate';

import {
  type RoutedDefinition,
  fileName,
  findStrips,
  gateCookies,
  gateProblem,
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

describe('gateCookies', () => {
  const url = 'https://cdwr.io';
  const now = Date.UTC(2026, 10, 12);

  it('sends no cookie without a password', () => {
    expect(gateCookies(url, undefined)).toEqual([]);
    expect(gateCookies(url, '')).toEqual([]);
  });

  it('mints a gate cookie the site accepts, scoped to the site', () => {
    const [cookie] = gateCookies(url, 'open sesame', now);

    expect(cookie).toMatchObject({
      name: SITE_GATE_COOKIE,
      url: 'https://cdwr.io/',
      httpOnly: true,
      sameSite: 'Lax'
    });
    expect(verifySiteGateToken(cookie.value, 'open sesame', { now })).toBe(
      true
    );
    expect(verifySiteGateToken(cookie.value, 'another', { now })).toBe(false);
  });

  it('lasts an hour, not the visitor week', () => {
    const [{ value }] = gateCookies(url, 'open sesame', now);
    const later = (minutes: number) => ({ now: now + minutes * 60_000 });

    expect(verifySiteGateToken(value, 'open sesame', later(59))).toBe(true);
    expect(verifySiteGateToken(value, 'open sesame', later(61))).toBe(false);
  });
});

describe('gateProblem', () => {
  const noCookie =
    "The gate page answered: the site is gated. Pass --gate-password with the site's SITE_GATE_PASSWORD, in single quotes.";
  const withCookie =
    "The gate page answered although a gate cookie was sent: the --gate-password does not match this site's SITE_GATE_PASSWORD, or the site answers from another host than --url (the cookie is scoped to it). Pass the production value, in single quotes; zsh rewrites $ and ! in an unquoted one.";

  it('is null when neither signal is there', () => {
    expect(
      gateProblem({ robotsTag: null, gateField: false }, false)
    ).toBeNull();
  });

  it('is null with only the header', () => {
    expect(
      gateProblem({ robotsTag: 'noindex', gateField: false }, false)
    ).toBeNull();
  });

  it('is null with only the field', () => {
    expect(gateProblem({ robotsTag: null, gateField: true }, false)).toBeNull();
  });

  it('asks for the password when no cookie was sent', () => {
    expect(gateProblem({ robotsTag: 'noindex', gateField: true }, false)).toBe(
      noCookie
    );
  });

  it('says the password does not match when a cookie was sent', () => {
    expect(gateProblem({ robotsTag: 'noindex', gateField: true }, true)).toBe(
      withCookie
    );
  });

  it('takes noindex among other directives', () => {
    expect(
      gateProblem({ robotsTag: 'noindex, nofollow', gateField: true }, false)
    ).toBe(noCookie);
  });
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
