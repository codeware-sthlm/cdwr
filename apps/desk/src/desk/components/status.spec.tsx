// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { model } from '../model';
import { createState } from '../state';
import {
  NEW,
  NOW,
  OLD,
  at,
  behind,
  connection,
  down,
  filled,
  live,
  runs,
  view
} from '../view/fixtures';

import { Status } from './status';

describe('Status', () => {
  it('opens the Platform view from the Platform pill', () => {
    const onView = vi.fn();
    const { container } = render(
      <Status
        m={model(filled(), NOW)}
        connection={connection(true)}
        onView={onView}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Platform/ }));
    expect(onView).toHaveBeenCalledWith('platform');
    expect(container.textContent).toContain('LIVE');
    expect(container.textContent).toContain('realtime ·');
  });

  it('shows the unknown state while polling', () => {
    const { container } = render(
      <Status
        m={model(filled(), NOW)}
        connection={connection(false)}
        onView={vi.fn()}
      />
    );
    expect(container.querySelector('.conn.off')).not.toBeNull();
    expect(container.textContent).toContain('POLLING');
    expect(container.textContent).toContain('every 5 min');
  });

  it('shows a dash for the checks while loading', () => {
    render(
      <Status
        m={model(createState(), NOW)}
        connection={connection(true)}
        onView={vi.fn()}
      />
    );
    expect(screen.getByText('checks –')).toBeTruthy();
  });

  it('counts failing checks and run problems', () => {
    const state = filled();
    state.data.runs = {
      ...runs(view()),
      last: { when: '2026-10-28 01:00', outcome: 'idle' }
    };
    const { container } = render(
      <Status
        m={model(state, NOW)}
        connection={connection(true)}
        onView={vi.fn()}
      />
    );
    expect(container.querySelector('.checks.bad')?.textContent).toMatch(
      /\d+ failing/
    );
  });

  it('says when the image is behind main, and not when both are current', () => {
    const stale = behind({ image: NEW, desk: null, deskWeb: null }, true);
    const first = render(
      <Status
        m={model(stale, NOW, null)}
        connection={stale.data.connection}
        onView={vi.fn()}
      />
    );
    expect(first.container.querySelector('.updates')?.textContent).toContain(
      '· 1 update'
    );
    first.unmount();
    const current = behind({ image: OLD, desk: OLD, deskWeb: null }, true);
    const second = render(
      <Status
        m={model(current, NOW, OLD)}
        connection={current.data.connection}
        onView={vi.fn()}
      />
    );
    expect(second.container.querySelector('.updates')).toBeNull();
  });

  it('shows OFFLINE once the channel is down', () => {
    const s = down(filled());
    const { container } = render(
      <Status
        m={model(s, NOW)}
        connection={s.data.connection}
        onView={vi.fn()}
      />
    );
    expect(container.querySelector('.conn.offline')).not.toBeNull();
    expect(screen.getByText('OFFLINE')).toBeTruthy();
    expect(container.querySelector('.long')?.textContent).toContain(
      'down since '
    );
    expect(container.querySelector('.short')?.textContent).toMatch(/^since /);
    expect(container.textContent).not.toContain('last event');
  });

  it('names the last event when one was seen before the drop', () => {
    const s = down(filled());
    s.data.connection.lastIssue = {
      issue_id: 'u',
      identifier: 'COD-1',
      action: 'update',
      updated_at: new Date(at(1)).toISOString()
    };
    const { container } = render(
      <Status
        m={model(s, NOW)}
        connection={s.data.connection}
        onView={vi.fn()}
      />
    );
    expect(container.querySelector('.long')?.textContent).toContain(
      'last event '
    );
    expect(container.textContent).not.toContain('down since');
  });

  it('shows POLLING, not OFFLINE, within the grace', () => {
    const grace = down(filled(), {
      retries: 0,
      downSince: NOW.getTime() - 2000
    });
    const { container } = render(
      <Status
        m={model(grace, NOW)}
        connection={grace.data.connection}
        onView={vi.fn()}
      />
    );
    expect(container.textContent).toContain('POLLING');
    expect(container.textContent).not.toContain('OFFLINE');
  });

  it('shows LIVE once the channel is up', () => {
    const on = live(filled());
    render(
      <Status
        m={model(on, NOW)}
        connection={on.data.connection}
        onView={vi.fn()}
      />
    );
    expect(screen.getByText('LIVE')).toBeTruthy();
  });
});
