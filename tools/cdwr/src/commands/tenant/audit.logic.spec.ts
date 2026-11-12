import {
  type AuditReport,
  auditFindings,
  auditMarkdown,
  isBroken,
  notFoundPath,
  ogCheck,
  sameOriginLinks
} from './audit.logic';

const okReport = (): AuditReport => ({
  url: 'https://cdwr.io',
  at: '2026-11-12T10:00:00.000Z',
  pages: [
    { route: '/', status: 200, consoleErrors: [], axe: [], brokenLinks: [] }
  ],
  og: {
    title: 'Home',
    description: 'A site',
    image: 'https://cdwr.io/og.png',
    imageStatus: 200,
    missing: []
  },
  notFound: [{ locale: 'sv', path: '/missing', status: 404, lang: 'sv' }]
});

describe('sameOriginLinks', () => {
  const base = 'https://cdwr.io/studio';

  it('keeps same-origin links, resolved, without hash, once, in order', () => {
    expect(
      sameOriginLinks(
        ['/a#top', 'b', '/a', 'https://cdwr.io/c', '#section'],
        base
      )
    ).toEqual([
      'https://cdwr.io/a',
      'https://cdwr.io/b',
      'https://cdwr.io/c',
      'https://cdwr.io/studio'
    ]);
  });

  it.each([
    ['mailto:a@b.se'],
    ['tel:+4612345'],
    ['javascript:void(0)'],
    ['https://other.com/a'],
    ['http://cdwr.io/a'],
    ['http://[bad']
  ])('leaves out %s', (href) => {
    expect(sameOriginLinks([href], base)).toEqual([]);
  });
});

describe('isBroken', () => {
  it.each([
    [null, true],
    [404, true],
    [500, true],
    [399, false],
    [200, false]
  ])('reads %s as %s', (status, expected) => {
    expect(isBroken(status)).toBe(expected);
  });
});

describe('ogCheck', () => {
  const tags = {
    'og:title': 'Home',
    'og:description': 'A site',
    'og:image': 'https://cdwr.io/og.png'
  };

  it('has nothing missing when all is set and the image answers', () => {
    expect(ogCheck(tags, 200).missing).toEqual([]);
  });

  it.each([
    ['og:title', ['og:title']],
    ['og:description', ['og:description']]
  ])('lists %s when absent', (tag, missing) => {
    expect(ogCheck({ ...tags, [tag]: null }, 200).missing).toEqual(missing);
  });

  it('lists an absent image once, without a status', () => {
    expect(ogCheck({ ...tags, 'og:image': null }, null).missing).toEqual([
      'og:image'
    ]);
  });

  it.each([
    [404, 'og:image (answers 404)'],
    [null, 'og:image (answers nothing)']
  ])('lists an image answering %s', (status, line) => {
    expect(ogCheck(tags, status).missing).toEqual([line]);
  });
});

describe('notFoundPath', () => {
  it('is a path under the stamp', () => {
    expect(notFoundPath('2026-11-12')).toBe('/cdwr-audit-missing-2026-11-12');
  });
});

describe('auditFindings', () => {
  it('is empty when all is well', () => {
    expect(auditFindings(okReport())).toEqual([]);
  });

  it('says one line per problem', () => {
    const report = okReport();
    report.pages = [
      {
        route: '/a',
        status: 500,
        consoleErrors: ['x', 'y'],
        axe: [
          { id: 'color-contrast', impact: 'serious', help: '', nodes: 3 },
          { id: 'label', impact: null, help: '', nodes: 1 }
        ],
        brokenLinks: [{ href: 'https://cdwr.io/gone', status: 404 }]
      },
      { route: '/b', status: null, consoleErrors: [], axe: [], brokenLinks: [] }
    ];
    report.og.missing = ['og:image'];
    report.notFound = [{ locale: 'en', path: '/m', status: 200, lang: 'en' }];

    expect(auditFindings(report)).toEqual([
      '/a: answers 500',
      '/a: 2 console error(s)',
      '/a: 2 axe violation(s) (color-contrast, label)',
      '/a: 1 broken link(s) (https://cdwr.io/gone)',
      '/b: answers nothing',
      'OG: missing og:image',
      '404 (en): /m answers 200'
    ]);
  });
});

describe('auditMarkdown', () => {
  it('has a heading, a table, OG, 404 and no findings', () => {
    const markdown = auditMarkdown(okReport());

    expect(markdown).toContain(
      '### Audit of https://cdwr.io at 2026-11-12T10:00:00.000Z'
    );
    expect(markdown).toContain(
      '| Route | Status | Console errors | Axe | Broken links |'
    );
    expect(markdown).toContain('| / | 200 | 0 | 0 | 0 |');
    expect(markdown).toContain('OG: title, description and image (200)');
    expect(markdown).toContain('404 in sv: 404, lang sv');
    expect(markdown).toContain('No findings');
  });

  it('lists the findings when there are some', () => {
    const report = okReport();
    report.og.missing = ['og:title'];

    const markdown = auditMarkdown(report);

    expect(markdown).toContain('OG: missing og:title');
    expect(markdown).toContain('- OG: missing og:title');
    expect(markdown).not.toContain('No findings');
  });
});
