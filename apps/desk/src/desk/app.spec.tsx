// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openStartHash, setSettingsOpener, showView, store } from './actions';
import { App } from './app';

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
  store.state.ui.view = 'desk';
  store.state.ui.openSheet = null;
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
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

  it('calls the settings opener from the Settings button', () => {
    const opener = vi.fn();
    setSettingsOpener(opener);
    const { container } = render(<App />);
    fireEvent.click(container.querySelector('#settings') as HTMLElement);
    expect(opener).toHaveBeenCalledTimes(1);
  });

  it('opens the Platform view named by the start hash', () => {
    window.history.replaceState(null, '', '/#platform');
    const { container } = render(<App />);
    expect(container.querySelector('#cards')).not.toBeNull();
    act(() => openStartHash());
    expect(container.querySelector('main#platform')).not.toBeNull();
    expect(container.querySelector('#cards')).toBeNull();
  });

  it('opens the tree view named by the start hash, also from an old sheet link', () => {
    window.history.replaceState(null, '', '/#tree');
    const { container } = render(<App />);
    act(() => openStartHash());
    expect(container.querySelector('main#tree')).not.toBeNull();
    expect(container.querySelector('#cards')).toBeNull();
    expect(store.state.ui.openSheet).toBeNull();
  });

  it('returns to the desk on Escape from the tree view', () => {
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
    act(() => showView('desk'));
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

  it('returns to the desk on Escape from the Platform view', () => {
    const { container } = render(<App />);
    act(() => showView('platform', false));
    expect(container.querySelector('#cards')).toBeNull();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(container.querySelector('#cards')).not.toBeNull();
    expect(container.querySelector('main#platform')).toBeNull();
  });

  it('focuses the Platform title when the view opens', () => {
    render(<App />);
    act(() => showView('platform'));
    expect(document.activeElement?.id).toBe('platform-title');
  });

  it('focuses the header Platform button when the Platform view closes', () => {
    const { container } = render(<App />);
    act(() => showView('platform'));
    act(() => showView('desk'));
    expect(document.activeElement).toBe(
      container.querySelector('button.platform')
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
