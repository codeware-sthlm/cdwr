// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TenantsPayload } from '../../supabase';
import {
  NOW as TENANTS_NOW,
  flyApp,
  minutesAgo,
  payload,
  tenant
} from '../../tenants/fixtures';
import { model } from '../model';
import { type DeskState, createState } from '../state';
import { NOW, filled, runs, view } from '../view/fixtures';

import { ViewSwitch } from './view-switch';

afterEach(cleanup);

/** A state with `n` plans waiting on you */
const waiting = (n: number): DeskState => {
  const s = filled();
  s.data.ideas = [];
  s.data.runs = runs(
    view({
      table: {
        before: Array.from({ length: n }, (_, i) => ({
          ticket: `COD-${10 + i}`,
          kind: 'plan' as const
        })),
        label: [],
        after: []
      }
    })
  );
  return s;
};

const down = (): TenantsPayload =>
  payload([
    tenant('zed', {
      apps: [
        flyApp('cdwr-headless-zed', 'headless', {
          health: { ok: false, status: 503, ms: 80 }
        })
      ]
    })
  ]);

const mount = (
  state: DeskState,
  tenants: TenantsPayload | null,
  current: 'agent' | 'platform' | 'health' | 'tree' = 'agent',
  onView = vi.fn()
) => {
  const { container } = render(
    <ViewSwitch
      m={model(state, NOW)}
      details={state.details}
      tenants={tenants}
      now={TENANTS_NOW}
      view={current}
      onView={onView}
    />
  );
  return {
    onView,
    agent: container.querySelector('[data-view="agent"]') as HTMLElement,
    platform: container.querySelector('[data-view="platform"]') as HTMLElement
  };
};

describe('ViewSwitch', () => {
  it('counts what waits on you and the production problems', () => {
    const { agent, platform } = mount(waiting(3), down());
    expect(agent.textContent).toBe('Agent3');
    expect(agent.getAttribute('aria-label')).toBe('Agent: 3 waiting on you');
    expect(platform.querySelector('.count')?.textContent).toMatch(/^[1-9]/);
    expect(platform.getAttribute('aria-label')).toMatch(
      /^Platform: \d+ problems?$/
    );
  });

  it('shows a dash and says loading until the data has arrived', () => {
    const { agent, platform } = mount(createState(), null);
    expect(agent.querySelector('.count')?.textContent).toBe('–');
    expect(agent.getAttribute('aria-label')).toBe('Agent: loading');
    expect(platform.querySelector('.count')?.textContent).toBe('–');
    expect(platform.getAttribute('aria-label')).toBe('Platform: loading');
  });

  it('says when there is no platform data yet', () => {
    const { platform } = mount(waiting(0), payload([]));
    expect(platform.querySelector('.count')?.textContent).toBe('–');
    expect(platform.getAttribute('aria-label')).toBe('Platform: no data yet');
  });

  it('says nothing waits and no problems', () => {
    const { agent, platform } = mount(waiting(0), payload([tenant('acme')]));
    expect(agent.getAttribute('aria-label')).toBe(
      'Agent: nothing waiting on you'
    );
    expect(platform.getAttribute('aria-label')).toBe('Platform: no problems');
    expect(platform.querySelector('.count')?.getAttribute('data-stale')).toBe(
      'false'
    );
  });

  it('marks a stale platform count and says so', () => {
    const { platform } = mount(
      waiting(0),
      payload([tenant('acme', { at: minutesAgo(40) })])
    );
    expect(platform.getAttribute('aria-label')).toBe(
      'Platform: no problems, data is stale'
    );
    const count = platform.querySelector('.count');
    expect(count?.getAttribute('data-stale')).toBe('true');
    expect(count?.className).toContain('outline-dashed');
  });

  it('marks Agent current, also on its pages, and Platform on Platform', () => {
    for (const page of ['agent', 'health', 'tree'] as const) {
      const { agent, platform } = mount(waiting(1), down(), page);
      expect(agent.getAttribute('aria-current')).toBe('page');
      expect(platform.hasAttribute('aria-current')).toBe(false);
      cleanup();
    }
    const { agent, platform } = mount(waiting(1), down(), 'platform');
    expect(agent.hasAttribute('aria-current')).toBe(false);
    expect(platform.getAttribute('aria-current')).toBe('page');
  });

  it('opens the view of the button pressed', () => {
    const { agent, platform, onView } = mount(waiting(1), down(), 'platform');
    fireEvent.click(agent);
    expect(onView).toHaveBeenLastCalledWith('agent');
    fireEvent.click(platform);
    expect(onView).toHaveBeenLastCalledWith('platform');
  });
});
