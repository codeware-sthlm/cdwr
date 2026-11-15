// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TenantsPayload } from '../supabase';

import {
  BEHIND,
  NOW,
  domain,
  flag,
  flyApp,
  machine,
  minutesAgo,
  payload,
  shared,
  tenant
} from './fixtures';
import { TenantsPage } from './page';
import { TenantsPill } from './pill';

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

const mount = (data: TenantsPayload | null, onDesk = vi.fn()) => {
  const { container } = render(
    <TenantsPage data={data} now={NOW} onDesk={onDesk} />
  );
  const all = (sel: string) =>
    Array.from(container.querySelectorAll<HTMLElement>(sel));
  return { container, all, text: container.textContent ?? '', onDesk };
};

const rows = () =>
  payload([
    shared(),
    tenant('acme'),
    tenant('zed', {
      apps: [
        flyApp('cdwr-cms-zed', 'cms', { machines: [machine({ sha: BEHIND })] }),
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

  it('goes back to the desk', () => {
    media(false);
    const { all, onDesk } = mount(payload([]));
    fireEvent.click(all('button.pf-back')[0]);
    expect(onDesk).toHaveBeenCalledTimes(1);
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

  it('shows the shared sessions against the limit', () => {
    media(false);
    const { all } = mount(rows());
    expect(
      all('[data-tenant="_shared"] [data-col="sessions"]')[0].textContent
    ).toBe('5 of 15');
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

  it('shows the database on the shared sheet', () => {
    media(false);
    const { all } = mount(rows());
    fireEvent.click(all('[data-tenant="_shared"]')[0]);
    const dialog = screen.getByRole('dialog', { name: 'Shared' });
    expect(dialog.textContent).toContain('5 of 15');
    expect(dialog.textContent).toContain('120 MiB');
    expect(dialog.textContent).toContain('host');
    expect(dialog.textContent).not.toContain('Domains');
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

describe('TenantsPill', () => {
  const pill = (data: TenantsPayload | null, onView = vi.fn()) => {
    const { container } = render(
      <TenantsPill data={data} now={NOW} view="desk" onView={onView} />
    );
    return { button: container.querySelector('button') as HTMLElement, onView };
  };

  it('shows the count of tenants and the worst status', () => {
    const { button } = pill(rows());
    expect(button.querySelector('.count')?.textContent).toBe('2');
    expect(button.dataset['worst']).toBe('down');
    expect(button.getAttribute('aria-label')).toBe('Tenants: 2, down');
    expect(button.querySelector('.dot')?.className).toContain('--block');
  });

  it('is green when every tenant is fine, and says when the data is stale', () => {
    const { button } = pill(payload([tenant('acme', { at: minutesAgo(40) })]));
    expect(button.dataset['worst']).toBe('ok');
    expect(button.querySelector('.dot')?.className).toContain('--live');
    expect(button.getAttribute('aria-label')).toContain('data is stale');
  });

  it('has no count or dot without data', () => {
    expect(pill(null).button.querySelector('.count')?.textContent).toBe('–');
    cleanup();
    const { button } = pill(payload([]));
    expect(button.querySelector('.dot')).toBeNull();
    expect(button.getAttribute('aria-label')).toBe('Tenants: no data yet');
  });

  it('opens the view', () => {
    const { button, onView } = pill(rows());
    fireEvent.click(button);
    expect(onView).toHaveBeenCalledWith('tenants');
  });
});
