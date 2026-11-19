// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TenantsPayload } from '../supabase';

import {
  BEHIND,
  LATEST,
  NOW,
  OLDER,
  deployRun,
  domain,
  flag,
  flyApp,
  machine,
  minutesAgo,
  payload,
  sentry,
  shared,
  tenant,
  topIssue,
  visitors
} from './fixtures';
import { TenantsPage } from './page';

/** jsdom has no matchMedia: report the phone width or not */
const media = (phone: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: phone,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined
      }) as unknown as MediaQueryList
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = (data: TenantsPayload | null) => {
  const { container } = render(<TenantsPage data={data} now={NOW} />);
  const all = (sel: string) =>
    Array.from(container.querySelectorAll<HTMLElement>(sel));
  return { container, all, text: container.textContent ?? '' };
};

const rows = () =>
  payload([
    shared(),
    tenant('acme'),
    tenant('zed', {
      apps: [
        flyApp('cdwr-cms-zed', 'cms', {
          machines: [machine({ sha: BEHIND })],
          behind: true
        }),
        flyApp('cdwr-headless-zed', 'headless', {
          health: { ok: false, status: 503, ms: 80 }
        })
      ],
      domains: [
        domain('zed.example.com', { certificate: 'Awaiting configuration' })
      ],
      switches: [flag('zed', 'on'), flag('zed', 'off', 'headless')],
      errors: { certs: 'cdwr-cms-zed: timeout' }
    })
  ]);

describe('TenantsPage', () => {
  it('shows what is missing before the first tick', () => {
    media(false);
    expect(mount(null).text).toContain('Loading…');
    cleanup();
    const empty = mount(payload([]));
    expect(empty.all('.tn-empty')[0].textContent).toBe(
      'No platform data yet — the NUC writes it every 10 minutes.'
    );
    expect(empty.all('[role="alert"]')).toHaveLength(0);
  });

  it('is the Platform page, titled for production and with no back button', () => {
    media(false);
    const { container, all } = mount(payload([]));
    expect(container.querySelector('h1#platform-title')?.textContent).toBe(
      'Platform'
    );
    expect(container.querySelector('.cap-sub')?.textContent).toContain(
      'production'
    );
    expect(all('button.pf-back')).toHaveLength(0);
  });

  it('lists the shared row and the tenants with the seven fields on a desktop', () => {
    media(false);
    const { all } = mount(rows());
    expect(all('[data-tenant]').map((e) => e.dataset['tenant'])).toEqual([
      '_shared',
      'acme',
      'zed'
    ]);
    const acme = all('[data-tenant="acme"]')[0];
    const cols = Array.from(acme.querySelectorAll<HTMLElement>('[data-col]'));
    expect(cols.map((c) => c.dataset['col'])).toEqual([
      'cms',
      'headless',
      'version',
      'health',
      'certificate',
      'sessions',
      'switches'
    ]);
    expect(cols.map((c) => c.textContent)).toEqual([
      'ok',
      'ok',
      'current',
      'ok',
      'ready',
      '–',
      '1 on'
    ]);
    const zed = all('[data-tenant="zed"]')[0];
    expect(
      Array.from(zed.querySelectorAll('[data-col]')).map((c) => c.textContent)
    ).toEqual([
      'ok',
      'down',
      'behind',
      '1 failing',
      '1 not ready',
      '–',
      '1 on · 1 off'
    ]);
    expect(all('[data-tenant]').map((e) => e.dataset['status'])).toEqual([
      'ok',
      'ok',
      'down'
    ]);
    expect(all('.tn-head')).toHaveLength(1);
  });

  it('shows the shared connections against the limit', () => {
    media(false);
    const { all } = mount(rows());
    expect(
      all('[data-tenant="_shared"] [data-col="sessions"]')[0].textContent
    ).toBe('3 of 57');
  });

  it('draws a name, a status chip and one line on the phone', () => {
    media(true);
    const { all } = mount(rows());
    expect(all('.tn-head')).toHaveLength(0);
    const zed = all('[data-tenant="zed"]')[0];
    expect(zed.querySelectorAll('[data-col]')).toHaveLength(0);
    expect(zed.querySelector('b')?.textContent).toBe('ZED');
    expect(zed.querySelector('.tn-chip')?.textContent).toBe('down');
    expect(zed.textContent).toContain(
      'cms ok · headless down · version behind'
    );
  });

  it('puts an alert band first when the data is stale, naming its age', () => {
    media(false);
    const stale = payload([tenant('acme', { at: minutesAgo(47) })]);
    const { container, all } = mount(stale);
    const band = all('[role="alert"]')[0];
    expect(band.textContent).toContain('47 min ago');
    expect(container.firstElementChild).toBe(band);
    cleanup();
    expect(
      mount(payload([tenant('acme', { at: minutesAgo(30) })])).all(
        '[role="alert"]'
      )
    ).toHaveLength(0);
  });

  it('opens a sheet with everything for the tenant, and closes it', () => {
    media(false);
    const { all } = mount(rows());
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(all('[data-tenant="zed"]')[0]);
    const dialog = screen.getByRole('dialog', { name: 'ZED' });
    const text = dialog.textContent ?? '';
    expect(text).toContain('zed · zed');
    expect(text).toContain('cdwr-cms-zed');
    expect(text).toContain('cdwr-headless-zed');
    expect(text).toContain('down · 503');
    expect(text).toContain('bbbbbbb (behind)');
    expect(text).toContain('zed.example.com');
    expect(text).toContain('certificate Awaiting configuration');
    expect(text).toContain('production · zed');
    expect(text).toContain('certs');
    expect(text).toContain('cdwr-cms-zed: timeout');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });

  it('shows the release a machine runs next to its commit', () => {
    media(false);
    const sheetText = (apps: ReturnType<typeof flyApp>[]) => {
      const { all } = mount(payload([tenant('zed', { apps })]));
      fireEvent.click(all('[data-tenant="zed"]')[0]);
      const text =
        screen.getByRole('dialog', { name: 'ZED' }).textContent ?? '';
      cleanup();
      return text;
    };
    expect(
      sheetText([
        flyApp('cdwr-cms-zed', 'cms', {
          latest: LATEST,
          behind: false,
          machines: [machine({ version: LATEST })]
        })
      ])
    ).toContain(`${LATEST} · aaaaaaa`);
    expect(
      sheetText([
        flyApp('cdwr-cms-zed', 'cms', {
          latest: LATEST,
          behind: true,
          machines: [machine({ sha: BEHIND, version: OLDER })]
        })
      ])
    ).toContain(`${OLDER} → ${LATEST} · bbbbbbb`);
    const plain = sheetText([
      flyApp('cdwr-cms-zed', 'cms', { machines: [machine()] })
    ]);
    expect(plain).toContain('aaaaaaa (current)');
    expect(plain).not.toContain('cms-1');
  });

  it('shows the database on the shared sheet', () => {
    media(false);
    const { all } = mount(rows());
    fireEvent.click(all('[data-tenant="_shared"]')[0]);
    const dialog = screen.getByRole('dialog', { name: 'Shared' });
    expect(dialog.textContent).toContain('Connections3 of 57');
    expect(dialog.textContent).toContain('Peak today9 at 08:15 UTC');
    expect(dialog.textContent).toContain('Opened since last read4');
    expect(dialog.textContent).toContain('Pooler sessions3');
    expect(dialog.textContent).toContain('All sessions5');
    expect(dialog.textContent).toContain('120 MiB');
    expect(dialog.textContent).toContain('host');
    expect(dialog.textContent).toContain('No host certificate was read.');
  });

  it('shows the actions on a tenant sheet only with controls, never on the shared one', () => {
    media(false);
    const platform = {
      can: true,
      host: 'nuc',
      commands: new Map(),
      send: vi.fn()
    };
    const open = (key: string, withPlatform: typeof platform | undefined) => {
      render(<TenantsPage data={rows()} now={NOW} platform={withPlatform} />);
      fireEvent.click(
        document.querySelector(`[data-tenant="${key}"]`) as Element
      );
      return screen.getByRole('dialog').textContent ?? '';
    };
    expect(open('acme', platform)).toContain('Close site');
    cleanup();
    expect(open('_shared', platform)).not.toContain('Close site');
    cleanup();
    expect(open('acme', { ...platform, can: false })).not.toContain(
      'Close site'
    );
    cleanup();
    expect(open('acme', undefined)).not.toContain('Close site');
  });

  it('names a read that failed instead of an empty list', () => {
    media(false);
    const { all } = mount(
      payload([
        tenant('acme', {
          apps: [flyApp('cdwr-cms-acme', 'cms', { machines: null })]
        })
      ])
    );
    fireEvent.click(all('[data-tenant="acme"]')[0]);
    expect(screen.getByRole('dialog').textContent).toContain(
      'The machines could not be read.'
    );
  });
});

describe('problems', () => {
  const sick = () =>
    payload([
      shared({
        deploy: deployRun({ runId: 77, conclusion: 'failure' })
      }),
      tenant('acme', {
        sentry: sentry({
          count24h: 31,
          count7d: 31,
          top: topIssue()
        }),
        visitors: visitors(15, [8, 9, 11, 10, 14, 9, 12])
      }),
      tenant('zed', {
        apps: [
          flyApp('cdwr-cms-zed', 'cms'),
          flyApp('cdwr-headless-zed', 'headless', {
            health: { ok: false, status: 503, ms: 80 }
          })
        ]
      })
    ]);

  it('says all clear when nothing is wrong', () => {
    media(false);
    const { all } = mount(payload([shared(), tenant('acme')]));
    expect(all('.tn-summary')[0].textContent).toBe('All clear');
    expect(all('.tn-needs')).toHaveLength(0);
    expect(all('[data-problem="true"]')).toHaveLength(0);
  });

  it('counts the problems by severity and the rows they touch', () => {
    media(false);
    const { all } = mount(sick());
    expect(all('.tn-summary')[0].textContent).toBe(
      '3 problems · 1 down · 2 warn · 3 rows affected'
    );
  });

  it('lists the problems worst first under Needs you, one evidence line each', () => {
    media(false);
    const { all } = mount(sick());
    const cards = all('.tn-problem');
    expect(cards.map((c) => c.dataset['problemKey'])).toEqual([
      'zed:down:cdwr-headless-zed',
      '_shared:deploy',
      'acme:errors'
    ]);
    expect(cards.map((c) => c.dataset['severity'])).toEqual([
      'down',
      'warn',
      'warn'
    ]);
    expect(cards[0].textContent).toContain('cdwr-headless-zed is down');
    expect(cards[0].textContent).toContain('ZED');
    expect(cards[0].textContent).toContain('Health check answered 503');
    expect(all('.tn-needs h2')[0].textContent).toBe('NEEDS YOU');
  });

  it('opens a sheet with the threshold, the evidence and what can be done', () => {
    media(false);
    const { all } = mount(sick());
    fireEvent.click(all('[data-problem-key="zed:down:cdwr-headless-zed"]')[0]);
    const dialog = screen.getByRole('dialog', {
      name: 'cdwr-headless-zed is down'
    });
    const text = dialog.textContent ?? '';
    expect(text).toContain('Health check answered 503');
    expect(text).toContain('does not answer within 10 s');
    expect(text).toContain('A suspended or stopped machine is not down');
    expect(text).toContain("Restart the app's machines (fly machine restart)");
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });

  it('links the top Sentry issue and the failed run in a new tab', () => {
    media(false);
    const { all } = mount(sick());
    fireEvent.click(all('[data-problem-key="acme:errors"]')[0]);
    const sentryLink = screen
      .getByRole('dialog')
      .querySelector<HTMLAnchorElement>('a[href]');
    expect(sentryLink?.getAttribute('href')).toBe(
      'https://cdwr.sentry.io/issues/?query=CMS-4F'
    );
    expect(sentryLink?.target).toBe('_blank');
    expect(sentryLink?.rel).toBe('noreferrer');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    cleanup();
    const second = mount(sick());
    fireEvent.click(second.all('[data-problem-key="_shared:deploy"]')[0]);
    const run = screen
      .getByRole('dialog')
      .querySelector<HTMLAnchorElement>('a[href]');
    expect(run?.getAttribute('href')).toBe(
      'https://github.com/codeware/cdwr/actions/runs/4242'
    );
    expect(run?.rel).toBe('noreferrer');
  });

  it('marks the rows that have an open problem', () => {
    media(false);
    const { all } = mount(sick());
    expect(
      all('[data-tenant]').map((e) => [
        e.dataset['tenant'],
        e.dataset['problem']
      ])
    ).toEqual([
      ['_shared', 'true'],
      ['acme', 'true'],
      ['zed', 'true']
    ]);
    expect(all('[data-tenant="zed"]')[0].className).toContain('--block');
    cleanup();
    const calm = mount(payload([tenant('acme'), tenant('zed')]));
    expect(calm.all('[data-tenant]').map((e) => e.dataset['problem'])).toEqual([
      'false',
      'false'
    ]);
  });

  it('shows the Sentry and visitors sections with a sparkline of seven days', () => {
    media(false);
    const { all } = mount(sick());
    fireEvent.click(all('[data-tenant="acme"]')[0]);
    const dialog = screen.getByRole('dialog', { name: 'ACME' });
    const text = dialog.textContent ?? '';
    expect(text).toContain('Last 24 hours');
    expect(text).toContain('4.4');
    expect(text).toContain('CMS-4F');
    expect(text).toContain('TypeError: x is undefined');
    expect(text).toContain('Today');
    expect(text).toContain('15');
    expect(text).toContain('10.4');
    const spark = dialog.querySelector('svg.tn-spark');
    expect(spark?.getAttribute('aria-label')).toBe(
      'Visitors per day, the last 7 days'
    );
    const points = spark
      ?.querySelector('polyline')
      ?.getAttribute('points')
      ?.split(' ');
    expect(points).toHaveLength(7);
  });

  it('leaves out the sections of a tenant without the reads, and shows their errors', () => {
    media(false);
    const { all } = mount(
      payload([
        tenant('acme', {
          errors: { sentry: 'unauthorized', umami: 'timeout', behind: 'no run' }
        })
      ])
    );
    fireEvent.click(all('[data-tenant="acme"]')[0]);
    const dialog = screen.getByRole('dialog', { name: 'ACME' });
    expect(dialog.querySelector('svg.tn-spark')).toBeNull();
    const text = dialog.textContent ?? '';
    expect(text).not.toContain('Last 24 hours');
    expect(text).toContain('sentry');
    expect(text).toContain('unauthorized');
    expect(text).toContain('umami');
    expect(text).toContain('behind');
  });

  it('keeps the cards and the sheet working on the phone', () => {
    media(true);
    const { all } = mount(sick());
    expect(all('.tn-problem')).toHaveLength(3);
    expect(all('[data-tenant="zed"]')[0].dataset['problem']).toBe('true');
    fireEvent.click(all('.tn-problem')[0]);
    expect(
      screen.getByRole('dialog', { name: 'cdwr-headless-zed is down' })
    ).toBeTruthy();
  });
});
