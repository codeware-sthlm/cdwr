// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CommandReply, PlatformCommandState } from '../desk/commands';

import {
  NO_HOST_TITLE,
  type PlatformApi,
  TenantActions,
  appDown,
  gateActions,
  sharedSha
} from './actions';
import { BEHIND, MAIN, flyApp, machine, tenant } from './fixtures';
import { parseTenantRow } from './model';

afterEach(cleanup);

const reply = (over: Partial<CommandReply> = {}): CommandReply => ({
  id: 1,
  status: 'pending',
  note: null,
  ...over
});

const api = (over: Partial<PlatformApi> = {}) => {
  const send = vi.fn<PlatformApi['send']>(() => Promise.resolve(reply()));
  const value: PlatformApi = {
    can: true,
    host: 'nuc',
    commands: new Map(),
    send,
    ...over
  };
  return { value, send };
};

const acme = (over: Parameters<typeof tenant>[1] = {}) =>
  parseTenantRow(tenant('acme', over));

const mount = (row = acme(), over: Partial<PlatformApi> = {}) => {
  const { value, send } = api(over);
  render(<TenantActions row={row} api={value} />);
  return { send };
};

const click = (id: string) =>
  fireEvent.click(
    document.querySelector(`[data-platform="${id}"]`) as HTMLElement
  );

const type = (text: string) =>
  fireEvent.change(screen.getByLabelText(/Type acme to confirm/), {
    target: { value: text }
  });

describe('helpers', () => {
  it('reads an app as down by its health or its machines', () => {
    const app = (over: Record<string, unknown>) =>
      parseTenantRow(
        tenant('t', { apps: [flyApp('cdwr-cms-t', 'cms', over as never)] })
      ).apps[0];
    expect(appDown(app({}))).toBe(false);
    expect(appDown(app({ health: { ok: false, status: 503, ms: 1 } }))).toBe(
      true
    );
    expect(appDown(app({ machines: [machine({ state: 'stopped' })] }))).toBe(
      true
    );
    expect(appDown(app({ machines: [] }))).toBe(true);
    expect(appDown(app({ machines: null, health: null }))).toBe(false);
  });

  it('shares a sha only when every machine carries the same one', () => {
    const app = (machines: unknown[]) =>
      parseTenantRow(
        tenant('t', {
          apps: [flyApp('cdwr-cms-t', 'cms', { machines: machines as never })]
        })
      ).apps[0];
    expect(sharedSha(app([machine(), machine({ id: 'm2' })]))).toBe(MAIN);
    expect(sharedSha(app([machine(), machine({ sha: BEHIND })]))).toBeNull();
    expect(sharedSha(app([]))).toBeNull();
    expect(sharedSha(app([machine({ sha: null })]))).toBeNull();
  });

  it('offers Open when an app is gated, Close when open, both when unknown', () => {
    const apps = (...gated: (boolean | null)[]) =>
      parseTenantRow(
        tenant('t', {
          apps: gated.map((g, i) =>
            flyApp(`cdwr-cms-${i}`, 'cms', g === null ? {} : { gated: g })
          )
        })
      ).apps;
    expect(gateActions(apps(true, false))).toEqual(['open']);
    expect(gateActions(apps(false, null))).toEqual(['close']);
    expect(gateActions(apps(null, null))).toEqual(['close', 'open']);
    expect(gateActions([])).toEqual(['close', 'open']);
  });
});

describe('TenantActions', () => {
  it('shows a restart per cms app, in danger styling when it is down', () => {
    mount(
      acme({
        apps: [
          flyApp('cdwr-cms-acme', 'cms', {
            health: { ok: false, status: 503, ms: 9 }
          }),
          flyApp('cdwr-cms-extra', 'cms'),
          flyApp('cdwr-headless-acme', 'headless')
        ]
      })
    );
    const down = screen.getByRole('button', { name: 'Restart cdwr-cms-acme' });
    const up = screen.getByRole('button', { name: 'Restart cdwr-cms-extra' });
    expect(down.className).toContain('--block');
    expect(up.className).not.toContain('--block');
    expect(screen.queryByText('Restart cdwr-headless-acme')).toBeNull();
  });

  it('shows Close site, Open site or both by what the apps read', () => {
    const labels = () =>
      screen
        .queryAllByRole('button')
        .map((b) => b.textContent)
        .filter((t) => t?.endsWith('site'));
    mount(acme({ apps: [flyApp('cdwr-cms-acme', 'cms', { gated: false })] }));
    expect(labels()).toEqual(['Close site']);
    cleanup();
    mount(acme({ apps: [flyApp('cdwr-cms-acme', 'cms', { gated: true })] }));
    expect(labels()).toEqual(['Open site']);
    cleanup();
    mount(acme());
    expect(labels()).toEqual(['Close site', 'Open site']);
  });

  it('sends only once the slug is typed', async () => {
    const { send } = mount();
    click('restart cdwr-cms-acme');
    const confirm = screen.getByRole('button', {
      name: 'Confirm: Restart cdwr-cms-acme'
    });
    expect(confirm).toHaveProperty('disabled', true);
    type('acm');
    expect(confirm).toHaveProperty('disabled', true);
    fireEvent.submit(confirm.closest('form') as HTMLElement);
    expect(send).not.toHaveBeenCalled();
    type('acme');
    expect(confirm).toHaveProperty('disabled', false);
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(send).toHaveBeenCalledWith('nuc', 'restart', {
      tenant: 'acme',
      app: 'cdwr-cms-acme',
      sha: MAIN
    });
  });

  it('sends the gate action without a password', async () => {
    const { send } = mount();
    click('gate close');
    type('acme');
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Confirm: Close site' })
      );
    });
    expect(send).toHaveBeenCalledWith('nuc', 'gate', {
      tenant: 'acme',
      action: 'close'
    });
  });

  it('cancels without sending', () => {
    const { send } = mount();
    click('gate open');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText(/Type acme/)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('shows pending, and the refusal note', () => {
    const commands = new Map<string, PlatformCommandState>([
      ['restart cdwr-cms-acme', { state: 'pending' }],
      ['gate acme', { state: 'refused', note: 'password not set' }]
    ]);
    mount(acme(), { commands });
    expect(
      screen.getByRole('button', { name: 'Restart cdwr-cms-acme…' })
    ).toHaveProperty('disabled', true);
    expect(screen.getByText('password not set')).toBeTruthy();
  });

  it('names where the password is after a close is applied', () => {
    const commands = new Map<string, PlatformCommandState>([
      ['gate acme', { state: 'applied', at: null, action: 'close' }]
    ]);
    mount(acme(), { commands });
    const text = document.querySelector(
      '[data-platform-password]'
    )?.textContent;
    expect(text).toContain('The password is in Infisical:');
    expect(text).toContain('/tenants/acme/apps/cms SITE_GATE_PASSWORD');
    expect(text).toContain('/tenants/acme/apps/headless SITE_GATE_PASSWORD');
  });

  it('says nothing about the password after an open', () => {
    const commands = new Map<string, PlatformCommandState>([
      ['gate acme', { state: 'applied', at: null, action: 'open' }]
    ]);
    mount(acme(), { commands });
    expect(document.querySelector('[data-platform-password]')).toBeNull();
  });

  it('shows a failure that stored no row', async () => {
    const send = vi.fn<PlatformApi['send']>(() =>
      Promise.reject(new Error('boom'))
    );
    const { value } = api({ send });
    render(<TenantActions row={acme()} api={value} />);
    click('gate close');
    type('acme');
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm: Close site' })
    );
    expect(await screen.findByText('The command failed.')).toBeTruthy();
  });

  it('disables the buttons with a title when no host applies commands', () => {
    mount(acme(), { host: null });
    const button = screen.getByRole('button', {
      name: 'Restart cdwr-cms-acme'
    });
    expect(button).toHaveProperty('disabled', true);
    expect(button.title).toBe(NO_HOST_TITLE);
  });
});
