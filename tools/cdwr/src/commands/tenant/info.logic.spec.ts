import {
  type TenantDetails,
  countsLine,
  detailLines,
  parseTenantDetails,
  primaryHostname,
  summaryRow,
  withoutKey
} from './info.logic';

const tenant: TenantDetails = {
  id: 19,
  name: 'cdwr.io',
  slug: 'cdwr-io',
  deployment: null,
  supportedLocales: ['en'],
  createdAt: '2026-09-24T18:00:00.000Z',
  apiKey: 'a-key',
  domains: [],
  settings: {
    appName: 'cdwr.io',
    defaultTheme: 'spotlight',
    themes: ['spotlight'],
    colorScheme: 'system',
    chrome: 'flat',
    defaultLocale: 'en'
  },
  counts: { pages: 6, posts: 5, media: 0, users: 0 }
};

describe('parseTenantDetails', () => {
  it('reads the list off the marker line', () => {
    expect(
      parseTenantDetails(`noise\nTENANT_DETAILS=${JSON.stringify([tenant])}\n`)
    ).toEqual([tenant]);
  });

  it('refuses output with no marker', () => {
    expect(() => parseTenantDetails('nothing\n')).toThrow('reported no result');
  });

  it('refuses a list with an unreadable entry', () => {
    expect(() =>
      parseTenantDetails(`TENANT_DETAILS=${JSON.stringify([{ id: 1 }])}`)
    ).toThrow('unreadable');
  });
});

describe('countsLine', () => {
  it('leaves out what there is none of', () => {
    expect(countsLine(tenant.counts)).toBe('6 pages · 5 posts');
  });

  it('says empty rather than nothing', () => {
    expect(countsLine({ pages: 0 })).toBe('empty');
  });
});

describe('primaryHostname', () => {
  it('prefers the primary, then the first, then a dash', () => {
    expect(
      primaryHostname([
        { hostname: 'a.se', app: 'cms', isPrimary: false, certificate: null },
        { hostname: 'b.se', app: 'cms', isPrimary: true, certificate: null }
      ])
    ).toBe('b.se');
    expect(
      primaryHostname([
        { hostname: 'a.se', app: 'cms', isPrimary: false, certificate: null }
      ])
    ).toBe('a.se');
    expect(primaryHostname([])).toBe('—');
  });
});

describe('summaryRow', () => {
  it('never carries the key, since a table scrolls past on production', () => {
    expect(summaryRow(tenant).join(' ')).not.toContain('a-key');
  });

  it('dashes what a local workspace does not have', () => {
    expect(summaryRow(tenant)).toEqual([
      'cdwr.io',
      'cdwr-io',
      '—',
      '—',
      'spotlight',
      '6 pages · 5 posts'
    ]);
  });
});

describe('detailLines', () => {
  it('shows the key, which is what a detail view is asked for', () => {
    expect(detailLines(tenant).join('\n')).toContain('API key      a-key');
  });

  it('says how to fill a workspace that has no site yet', () => {
    const lines = detailLines({ ...tenant, settings: null }).join('\n');

    expect(lines).toContain('not set up yet');
    expect(lines).toContain('apply-site');
  });

  it('marks the primary domain and its certificate', () => {
    const lines = detailLines({
      ...tenant,
      domains: [
        {
          hostname: 'cdwr.io',
          app: 'cms',
          isPrimary: true,
          certificate: 'issued'
        }
      ]
    }).join('\n');

    expect(lines).toContain('cdwr.io (primary) → cms, certificate issued');
  });

  it('lists the other themes only when there are any to switch to', () => {
    const one = detailLines(tenant).join('\n');
    const many = detailLines({
      ...tenant,
      settings: {
        appName: 'cdwr.io',
        defaultTheme: 'spotlight',
        themes: ['spotlight', 'codeware'],
        colorScheme: 'system',
        chrome: 'flat',
        defaultLocale: 'en'
      }
    }).join('\n');

    expect(one).not.toContain('offers');
    expect(many).toContain('offers spotlight, codeware');
  });
});

describe('withoutKey', () => {
  it('drops the field rather than nulling it, which would mean something else', () => {
    expect('apiKey' in withoutKey(tenant)).toBe(false);
    expect(withoutKey(tenant).slug).toBe('cdwr-io');
  });
});
