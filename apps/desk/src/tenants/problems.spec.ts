import { describe, expect, it } from 'vitest';

import {
  BEHIND,
  MAIN,
  deployRun,
  domain,
  flyApp,
  machine,
  sentry,
  shared,
  tenant,
  topIssue
} from './fixtures';
import { parseTenantRow } from './model';
import {
  ERRORS_FACTOR,
  ERRORS_MIN,
  allProblems,
  problemsOf,
  sentryIssueUrl
} from './problems';

const tenantProblems = (over: Parameters<typeof tenant>[1] = {}) =>
  problemsOf(parseTenantRow(tenant('acme', over)));

const sharedProblems = (over: Parameters<typeof shared>[0] = {}) =>
  problemsOf(parseTenantRow(shared(over)));

const spike = (count24h: number, count7d: number) =>
  tenantProblems({ sentry: sentry({ count24h, count7d }) });

describe('down', () => {
  it('is raised once per app whose health is read and not ok', () => {
    const found = tenantProblems({
      apps: [
        flyApp('cdwr-cms-acme', 'cms', {
          health: { ok: false, status: 503, ms: 80 }
        }),
        flyApp('cdwr-headless-acme', 'headless', {
          health: { ok: false, status: null, ms: 10000 }
        })
      ]
    });
    expect(found.map((p) => [p.key, p.severity, p.kind])).toEqual([
      ['acme:down:cdwr-cms-acme', 'down', 'down'],
      ['acme:down:cdwr-headless-acme', 'down', 'down']
    ]);
    expect(found[0].evidence).toEqual(['Health check answered 503']);
    expect(found[1].evidence).toEqual(['No answer within 10 s']);
    expect(found[0].threshold).toContain('10 s');
  });

  it('is raised for an app with no machine at all', () => {
    const found = tenantProblems({
      apps: [flyApp('cdwr-cms-acme', 'cms', { machines: [] })]
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      key: 'acme:down:cdwr-cms-acme',
      severity: 'down',
      title: 'cdwr-cms-acme has no machine'
    });
  });

  it('is not raised for suspended or stopped machines, an unread app or an unread health', () => {
    expect(
      tenantProblems({
        apps: [
          flyApp('a', 'cms', {
            machines: [
              machine({ state: 'suspended' }),
              machine({ id: 'm2', state: 'stopped' })
            ]
          }),
          flyApp('b', 'cms', { machines: null, health: null })
        ]
      })
    ).toEqual([]);
  });

  it('gives an app that fails and has no machine one problem', () => {
    expect(
      tenantProblems({
        apps: [
          flyApp('a', 'cms', {
            machines: [],
            health: { ok: false, status: 502, ms: 5 }
          })
        ]
      })
    ).toHaveLength(1);
  });
});

describe('behind', () => {
  it('is raised per app with behind true, naming the commits', () => {
    const row = parseTenantRow(
      tenant('acme', {
        apps: [
          flyApp('a', 'cms', {
            behind: true,
            machines: [
              machine({ sha: BEHIND }),
              machine({ id: 'm2', sha: BEHIND })
            ]
          }),
          flyApp('b', 'headless', { behind: false }),
          flyApp('c', 'headless', { behind: null })
        ]
      })
    );
    const found = problemsOf(row, MAIN);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      key: 'acme:behind:a',
      severity: 'warn',
      evidence: ['Machines on bbbbbbb, the newest deploy of main is aaaaaaa']
    });
    expect(found[0].threshold).toContain('newest deploy run of main');
  });
});

describe('cert', () => {
  it('is raised per hostname whose certificate is pending, not an unknown one', () => {
    const found = tenantProblems({
      domains: [
        domain('a.example.com', { certificate: 'Awaiting configuration' }),
        domain('b.example.com', { certificate: 'unknown' }),
        domain('c.example.com', { certificate: 'missing' }),
        domain('d.example.com')
      ]
    });
    expect(found.map((p) => p.key)).toEqual([
      'acme:cert:a.example.com',
      'acme:cert:c.example.com'
    ]);
    expect(found[0].severity).toBe('warn');
  });
});

describe('pooler', () => {
  it('is raised on the shared row from 12 sessions, not at 11', () => {
    const at = (sessions: number) =>
      sharedProblems({ db: { sizeBytes: null, sessions, byApplication: {} } });
    expect(at(11)).toEqual([]);
    const found = at(12);
    expect(found.map((p) => p.key)).toEqual(['_shared:pooler']);
    expect(found[0].evidence).toEqual(['12 of 15 sessions in use']);
    expect(found[0].threshold).toContain('12');
    expect(at(15)).toHaveLength(1);
  });
});

describe('errors', () => {
  it('needs 10 events in 24 hours: 9 is not a spike, 10 against no average is', () => {
    expect(spike(ERRORS_MIN - 1, ERRORS_MIN - 1)).toEqual([]);
    expect(spike(ERRORS_MIN, ERRORS_MIN)).toHaveLength(1);
  });

  it('needs three times the average of the six days before', () => {
    // average (60 - 30) / 6 = 5: 15 is exactly 3x
    expect(spike(15 - 1, 14 + 30)).toEqual([]);
    expect(spike(15, 15 + 30)).toHaveLength(1);
    expect(ERRORS_FACTOR).toBe(3);
  });

  it('qualifies any count of 10 or more when the average is 0', () => {
    expect(spike(40, 40)).toHaveLength(1);
  });

  it('carries the top issue in its evidence and the thresholds in its text', () => {
    const [p] = tenantProblems({
      sentry: sentry({ count24h: 31, count7d: 31, top: topIssue() })
    });
    expect(p.key).toBe('acme:errors');
    expect(p.evidence).toContain(
      'CMS-4F · error · 31× · TypeError: x is undefined'
    );
    expect(p.threshold).toContain('10');
    expect(p.threshold).toContain('3 times');
  });

  it('links an issue by its short id in the org', () => {
    expect(sentryIssueUrl('cdwr', 'CMS-4F')).toBe(
      'https://cdwr.sentry.io/issues/?query=CMS-4F'
    );
  });

  it('is not raised without a sentry read', () => {
    expect(tenantProblems()).toEqual([]);
    expect(tenantProblems({ sentry: ['x'] })).toEqual([]);
  });
});

describe('deploy', () => {
  it('is raised on the shared row for a failed deploy job, not for a skipped one', () => {
    const at = (conclusion: string) =>
      sharedProblems({ deploy: deployRun({ conclusion }) });
    const found = at('failure');
    expect(found.map((p) => p.key)).toEqual(['_shared:deploy']);
    expect(found[0].evidence[0]).toContain('4242');
    expect(found[0].evidence[0]).toContain('aaaaaaa');
    expect(at('skipped')).toEqual([]);
    expect(at('success')).toEqual([]);
    expect(at('cancelled')).toEqual([]);
    expect(at('none')).toEqual([]);
  });

  it('clears with the next run: the column holds the newest one', () => {
    expect(
      sharedProblems({ deploy: deployRun({ runId: 1, conclusion: 'failure' }) })
    ).toHaveLength(1);
    expect(
      sharedProblems({ deploy: deployRun({ runId: 2, conclusion: 'success' }) })
    ).toEqual([]);
  });

  it('reads a malformed column as no deploy', () => {
    expect(sharedProblems({ deploy: { conclusion: 'failure' } })).toEqual([]);
    expect(sharedProblems({ deploy: 'failure' })).toEqual([]);
  });
});

describe('allProblems', () => {
  const entries = () =>
    [
      tenant('zed', {
        apps: [flyApp('cdwr-cms-zed', 'cms', { behind: true })],
        domains: [domain('z.example.com', { certificate: 'pending' })]
      }),
      tenant('acme', {
        apps: [flyApp('cdwr-cms-acme', 'cms', { machines: [] })]
      }),
      shared({
        db: { sizeBytes: null, sessions: 13, byApplication: {} },
        deploy: deployRun({ conclusion: 'failure' })
      }),
      tenant('mid', {
        apps: [
          flyApp('cdwr-cms-mid', 'cms', {
            health: { ok: false, status: 500, ms: 1 }
          })
        ]
      })
    ].map((r) => ({ row: parseTenantRow(r) }));

  it('puts down before warn, then _shared first, then rows by key, then kinds', () => {
    expect(allProblems(entries()).map((p) => p.key)).toEqual([
      'acme:down:cdwr-cms-acme',
      'mid:down:cdwr-cms-mid',
      '_shared:deploy',
      '_shared:pooler',
      'zed:behind:cdwr-cms-zed',
      'zed:cert:z.example.com'
    ]);
  });

  it('is empty for a healthy platform', () => {
    expect(
      allProblems(
        [tenant('acme'), shared()].map((r) => ({ row: parseTenantRow(r) }))
      )
    ).toEqual([]);
  });

  it('gives the behind evidence the shared row deploy commit', () => {
    const found = allProblems(
      [
        shared({ deploy: deployRun({ sha: 'c'.repeat(40) }) }),
        tenant('acme', {
          apps: [flyApp('cdwr-cms-acme', 'cms', { behind: true })]
        })
      ].map((r) => ({ row: parseTenantRow(r) }))
    );
    expect(found[0].evidence[0]).toContain('newest deploy of main is ccccccc');
  });
});
