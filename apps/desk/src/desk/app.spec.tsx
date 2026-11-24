// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hideSheet,
  openStartHash,
  openTicket,
  setSettingsOpener,
  sheetActions,
  showSheet,
  showView,
  store
} from './actions';
import { App } from './app';
import { createState } from './state';
import type { QueueTreeNode } from './types';
import { filled, gap, runs, view } from './view/fixtures';

beforeEach(() => {
  // jsdom has no matchMedia: the sheet reads it for the phone width
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined
      }) as unknown as MediaQueryList
  );
  store.state.ui.view = 'agent';
  store.state.ui.openSheet = null;
  store.state.ui.ticket = null;
  window.history.replaceState(null, '', '/');
  localStorage.removeItem('aq-view');
});

afterEach(() => {
  // Each test starts from one page: a mounted App keeps listening to the store
  cleanup();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('waits for settings without an adapter, with the header buttons', () => {
    const { container } = render(<App />);
    expect(container.querySelector('#fresh')?.textContent).toBe(
      'Waiting for settings'
    );
    expect(container.querySelector('#refresh')).not.toBeNull();
    expect(container.querySelector('#settings')).not.toBeNull();
  });

  it('draws the header in two rows: status above, brand and tools below', () => {
    const { container } = render(<App />);
    const rows = container.querySelectorAll('header.top > div');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector('#status')).not.toBeNull();
    expect(rows[0]?.querySelector('#fresh')).not.toBeNull();
    expect(rows[0]?.querySelector('a.who')).not.toBeNull();
    expect(rows[1]?.querySelector('h1')?.textContent).toBe('CDWR Desk');
    expect(rows[1]?.querySelector('.view-switch')).not.toBeNull();
    expect(rows[1]?.querySelector('button.tree-pill')).not.toBeNull();
    for (const id of ['refresh', 'settings']) {
      const b = rows[1]?.querySelector(`#${id}`);
      expect(b?.getAttribute('aria-label')).not.toBeNull();
      expect(b?.getAttribute('title')).toBe(b?.getAttribute('aria-label'));
      expect(b?.textContent).toBe('');
    }
  });

  it('calls the settings opener from the Settings button', () => {
    const opener = vi.fn();
    setSettingsOpener(opener);
    const { container } = render(<App />);
    fireEvent.click(container.querySelector('#settings') as HTMLElement);
    expect(opener).toHaveBeenCalledTimes(1);
  });

  it('opens the Platform view named by the start hash, and from an old #tenants link', () => {
    for (const hash of ['#platform', '#tenants']) {
      window.history.replaceState(null, '', '/' + hash);
      const { container } = render(<App />);
      expect(container.querySelector('#cards')).not.toBeNull();
      act(() => openStartHash());
      expect(store.state.ui.view).toBe('platform');
      expect(container.querySelector('main#platform')).not.toBeNull();
      expect(container.querySelector('#cards')).toBeNull();
      cleanup();
      act(() => showView('agent', false));
    }
  });

  it('opens Agent health from #health and from an old #nuc link', () => {
    for (const hash of ['#health', '#nuc']) {
      window.history.replaceState(null, '', '/' + hash);
      const { container } = render(<App />);
      act(() => openStartHash());
      expect(store.state.ui.view).toBe('health');
      expect(container.querySelector('main#health')).not.toBeNull();
      expect(container.querySelector('#cards')).toBeNull();
      cleanup();
      act(() => showView('agent', false));
    }
  });

  it('opens the Platform view kept for this device when the start hash names none', () => {
    const { container } = render(<App />);
    act(() => showView('platform', false));
    expect(localStorage.getItem('aq-view')).toBe('platform');
    act(() => {
      store.state.ui.view = 'agent';
    });
    window.history.replaceState(null, '', '/');
    act(() => openStartHash());
    expect(store.state.ui.view).toBe('platform');
    expect(container.querySelector('main#platform')).not.toBeNull();
  });

  it('lets a start hash win over the kept view', () => {
    localStorage.setItem('aq-view', 'platform');
    window.history.replaceState(null, '', '/#before');
    render(<App />);
    act(() => openStartHash());
    expect(store.state.ui.view).toBe('agent');
    expect(store.state.ui.openSheet).toBe('before');
    act(() => hideSheet());
    window.history.replaceState(null, '', '/#health');
    act(() => openStartHash());
    expect(store.state.ui.view).toBe('health');
  });

  it('keeps Agent and Platform for the next visit, but not Agent health or the tree', () => {
    render(<App />);
    act(() => showView('platform', false));
    act(() => showView('health', false));
    expect(localStorage.getItem('aq-view')).toBe('platform');
    act(() => showView('tree', false));
    expect(localStorage.getItem('aq-view')).toBe('platform');
    act(() => showView('agent', false));
    expect(localStorage.getItem('aq-view')).toBe('agent');
  });

  it('opens the tree view named by the start hash, also from an old sheet link', () => {
    window.history.replaceState(null, '', '/#tree');
    const { container } = render(<App />);
    act(() => openStartHash());
    expect(container.querySelector('main#tree')).not.toBeNull();
    expect(container.querySelector('#cards')).toBeNull();
    expect(store.state.ui.openSheet).toBeNull();
  });

  it('returns to Agent on Escape from the tree view', () => {
    const { container } = render(<App />);
    act(() => showView('tree', false));
    expect(container.querySelector('main#tree')).not.toBeNull();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(container.querySelector('#cards')).not.toBeNull();
    expect(container.querySelector('main#tree')).toBeNull();
  });

  it('focuses the tree title when the view opens, and the Tree button when it closes', () => {
    const { container } = render(<App />);
    act(() => showView('tree'));
    expect(document.activeElement?.id).toBe('tree-title');
    act(() => showView('agent'));
    expect(document.activeElement).toBe(
      container.querySelector('button.tree-pill')
    );
  });

  it('opens the tree view from the header Tree button', () => {
    const { container } = render(<App />);
    act(() => {
      fireEvent.click(
        container.querySelector('button.tree-pill') as HTMLElement
      );
    });
    expect(store.state.ui.view).toBe('tree');
    expect(window.location.hash).toBe('#tree');
  });

  it('opens Platform from the header switch, focuses its title, and Agent takes focus back', () => {
    const { container } = render(<App />);
    const platform = container.querySelector(
      '.view-switch button[data-view="platform"]'
    ) as HTMLElement;
    act(() => {
      fireEvent.click(platform);
    });
    expect(store.state.ui.view).toBe('platform');
    expect(window.location.hash).toBe('#platform');
    expect(container.querySelector('main#platform')).not.toBeNull();
    expect(container.querySelector('#cards')).toBeNull();
    expect(document.activeElement?.id).toBe('platform-title');
    expect(platform.getAttribute('aria-current')).toBe('page');
    act(() => {
      fireEvent.click(
        container.querySelector(
          '.view-switch button[data-view="agent"]'
        ) as HTMLElement
      );
    });
    expect(store.state.ui.view).toBe('agent');
    expect(window.location.hash).toBe('');
    expect(container.querySelector('#cards')).not.toBeNull();
  });

  it('shows only the switch, Refresh and Settings in the header on Platform, with the connection indicator', () => {
    const { container } = render(<App />);
    act(() => showView('platform', false));
    expect(container.querySelector('button.tree-pill')).toBeNull();
    expect(container.querySelector('button.health')).toBeNull();
    expect(container.querySelector('#search')).toBeNull();
    expect(container.querySelector('.view-switch')).not.toBeNull();
    expect(container.querySelector('#status .conn')).not.toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe('CDWR Desk');
    expect(container.querySelector('.sub')?.textContent).toContain(
      'production'
    );
    act(() => showView('agent', false));
    expect(container.querySelector('button.health')).not.toBeNull();
    expect(container.querySelector('#search')).not.toBeNull();
  });

  it('keeps Agent current in the switch on its pages', () => {
    const { container } = render(<App />);
    const agent = container.querySelector(
      '.view-switch button[data-view="agent"]'
    );
    act(() => showView('health', false));
    expect(agent?.getAttribute('aria-current')).toBe('page');
    act(() => showView('tree', false));
    expect(agent?.getAttribute('aria-current')).toBe('page');
  });

  it('opens the sheet named by the start hash', () => {
    window.history.replaceState(null, '', '/#before');
    render(<App />);
    act(() => openStartHash());
    expect(store.state.ui.openSheet).toBe('before');
    expect(
      screen.getByRole('dialog', {
        name: 'Waiting on you, furthest along first'
      })
    ).not.toBeNull();
  });

  it('opens the Ticket sheet named by a #ticket/ start hash, titled with the id', () => {
    window.history.replaceState(null, '', '/#ticket/COD-1');
    render(<App />);
    act(() => openStartHash());
    expect(store.state.ui.openSheet).toBe('ticket');
    expect(store.state.ui.ticket).toBe('COD-1');
    expect(screen.getByRole('dialog', { name: 'COD-1' })).not.toBeNull();
    expect(window.location.hash).toBe('#ticket/COD-1');
  });

  it('takes a lower-case or bare number in a #ticket/ hash, and opens nothing for a bare #ticket', () => {
    window.history.replaceState(null, '', '/#ticket/cod-12');
    render(<App />);
    act(() => openStartHash());
    expect(store.state.ui.ticket).toBe('COD-12');
    act(() => hideSheet());
    store.state.ui.ticket = null;
    window.history.replaceState(null, '', '/#ticket');
    act(() => openStartHash());
    expect(store.state.ui.openSheet).toBeNull();
  });

  it('writes #ticket/COD-n when a ticket is opened', () => {
    render(<App />);
    act(() => openTicket('COD-5'));
    expect(window.location.hash).toBe('#ticket/COD-5');
    act(() => hideSheet());
    expect(window.location.hash).toBe('');
  });

  it('gives focus back to what opened the Ticket sheet, else to the search field', async () => {
    const { container } = render(<App />);
    const refresh = container.querySelector('#refresh') as HTMLElement;
    act(() => refresh.focus());
    act(() => openTicket('COD-5'));
    act(() => hideSheet());
    await waitFor(() => expect(document.activeElement).toBe(refresh));
    // One opened without focus, as a start hash does, has no opener
    act(() => openTicket('COD-6', false));
    act(() => hideSheet());
    await waitFor(() =>
      expect(document.activeElement).toBe(container.querySelector('#search'))
    );
  });

  it('keeps the tree view on Escape in the search field', () => {
    const { container } = render(<App />);
    act(() => showView('tree', false));
    const field = screen.getByRole('combobox');
    fireEvent.change(field, { target: { value: 'COD-1' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(container.querySelector('main#tree')).not.toBeNull();
    expect((field as HTMLInputElement).value).toBe('');
  });

  it('returns to Agent on Escape from Agent health', () => {
    const { container } = render(<App />);
    act(() => showView('health', false));
    expect(container.querySelector('#cards')).toBeNull();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(container.querySelector('#cards')).not.toBeNull();
    expect(container.querySelector('main#health')).toBeNull();
  });

  it('stays on Platform and on Agent at Escape', () => {
    const { container } = render(<App />);
    act(() => showView('platform', false));
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(store.state.ui.view).toBe('platform');
    expect(container.querySelector('main#platform')).not.toBeNull();
    act(() => showView('agent', false));
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(store.state.ui.view).toBe('agent');
  });

  it('focuses the Agent health title when the view opens', () => {
    render(<App />);
    act(() => showView('health'));
    expect(document.activeElement?.id).toBe('health-title');
  });

  it('focuses the header Agent health button when Agent health closes', () => {
    const { container } = render(<App />);
    act(() => showView('health'));
    act(() => showView('agent'));
    expect(document.activeElement).toBe(
      container.querySelector('button.health')
    );
  });

  it('opens the Waiting on you sheet from a click on its card', () => {
    const { container } = render(<App />);
    act(() => {
      fireEvent.click(
        container.querySelector('article[data-w="before"]') as HTMLElement
      );
    });
    expect(store.state.ui.openSheet).toBe('before');
    expect(window.location.hash).toBe('#before');
  });
});

describe('App Show in tree', () => {
  const node = (
    ticket: string,
    over: Partial<QueueTreeNode> = {}
  ): QueueTreeNode => ({
    ticket,
    title: `Title of ${ticket}`,
    state: 'started',
    label: null,
    pr: null,
    position: null,
    waiting: false,
    blockers: [],
    gaps: [],
    children: [],
    ...over
  });

  /** A root with a queued child that holds a gap, and the audit's ready-planned gap on the child */
  const load = (): void => {
    const s = filled();
    s.data.runs = runs(
      view({
        audit: [gap('COD-1', 'ready-planned')],
        tree: [
          node('COD-10', {
            position: 1,
            children: [
              node('COD-1', {
                position: 1,
                label: 'agent:ready',
                gaps: [{ kind: 'ready-planned', candidate: false }]
              }),
              node('COD-11')
            ]
          })
        ]
      })
    );
    Object.assign(store.state, s);
  };

  const scrollIntoView = vi.fn();

  beforeEach(() => {
    // jsdom has no scrollIntoView, which a revealed row calls
    Element.prototype.scrollIntoView = scrollIntoView;
    scrollIntoView.mockClear();
    Object.assign(store.state, createState());
    store.state.ui.view = 'agent';
    load();
  });

  afterEach(() => {
    Object.assign(store.state, createState());
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  const showButton = (): HTMLElement =>
    document.querySelector('[data-tree="COD-1"]') as HTMLElement;

  it('closes the sheet, opens the closed root and focuses the ticket row once the sheet has closed', async () => {
    // The viewer closed the root by hand
    store.state.ui.treeOpen = { 'COD-10': false };
    const { container } = render(<App />);
    act(() => showSheet('before'));
    expect(screen.getByRole('dialog')).not.toBeNull();
    act(() => {
      fireEvent.click(showButton());
    });
    expect(store.state.ui.openSheet).toBeNull();
    expect(store.state.ui.view).toBe('tree');
    expect(container.querySelector('#tree-title')).not.toBeNull();
    expect(store.state.ui.treeOpen['COD-10']).toBe(true);
    expect(
      container.querySelector('button[aria-label="Collapse COD-10 sub-issues"]')
    ).not.toBeNull();
    expect(
      container.querySelector('#tree-COD-10')?.hasAttribute('hidden')
    ).toBe(false);
    await waitFor(() => {
      const row = container.querySelector('#tree-row-COD-1');
      expect(row).not.toBeNull();
      expect(document.activeElement).toBe(row);
    });
    const row = container.querySelector('#tree-row-COD-1') as HTMLElement;
    expect(row.hasAttribute('data-shown')).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // The mark goes with the focus
    act(() => row.blur());
    expect(row.hasAttribute('data-shown')).toBe(false);
  });

  it('opens a root that starts collapsed because it is finished in full', async () => {
    const s = filled();
    s.data.runs = runs(
      view({
        audit: [gap('COD-1', 'ready-planned')],
        tree: [
          node('COD-10', {
            state: 'completed',
            children: [node('COD-1', { state: 'completed' })]
          })
        ]
      })
    );
    Object.assign(store.state, s);
    // Closed shows the finished root, so the filter does not hide it
    store.state.ui.tree = { closed: true, gaps: false, unqueued: false };
    const { container } = render(<App />);
    act(() => showSheet('before'));
    act(() => {
      fireEvent.click(showButton());
    });
    expect(store.state.ui.treeOpen['COD-10']).toBe(true);
    expect(
      container.querySelector('#tree-COD-10')?.hasAttribute('hidden')
    ).toBe(false);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        container.querySelector('#tree-row-COD-1')
      )
    );
  });

  it('turns off only the Not queued filter that hides the root, and keeps the others', async () => {
    store.state.ui.tree = { closed: true, gaps: true, unqueued: true };
    const { container } = render(<App />);
    act(() => showSheet('before'));
    act(() => {
      fireEvent.click(showButton());
    });
    expect(store.state.ui.tree).toEqual({
      closed: true,
      gaps: true,
      unqueued: false
    });
    expect(
      container
        .querySelector('[data-filter="unqueued"]')
        ?.getAttribute('aria-pressed')
    ).toBe('false');
    expect(
      container
        .querySelector('[data-filter="gaps"]')
        ?.getAttribute('aria-pressed')
    ).toBe('true');
    await waitFor(() =>
      expect(document.activeElement).toBe(
        container.querySelector('#tree-row-COD-1')
      )
    );
  });

  it('focuses the row at once when no sheet is open', () => {
    const { container } = render(<App />);
    expect(store.state.ui.openSheet).toBeNull();
    act(() => sheetActions.wait.showInTree('COD-1'));
    expect(store.state.ui.view).toBe('tree');
    expect(container.querySelector('#tree-title')).not.toBeNull();
    const row = container.querySelector('#tree-row-COD-1');
    expect(document.activeElement).toBe(row);
    expect(row?.hasAttribute('data-shown')).toBe(true);
  });
});
