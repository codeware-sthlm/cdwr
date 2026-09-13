import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PayloadProvider,
  type PayloadValue
} from '../providers/PayloadProvider';

import { useHumanCheck } from './use-human-check';

const render_ = vi.fn();

vi.mock('./turnstile', () => ({
  loadTurnstile: vi.fn(async () => ({
    render: render_,
    remove: vi.fn()
  }))
}));

const { loadTurnstile } = await import('./turnstile');

/** Only what the hook reads; the rest of the contract is not exercised here. */
const withSite = (humanCheck: PayloadValue['humanCheck']) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PayloadProvider
        value={{ colorScheme: 'light', humanCheck } as PayloadValue}
      >
        {children}
      </PayloadProvider>
    );
  };

type Probe = ReturnType<typeof useHumanCheck>;

let latest: Probe;

function Form({ disabled }: { disabled?: boolean } = {}) {
  const humanCheck = useHumanCheck({ disabled });
  latest = humanCheck;

  return <form>{humanCheck.fields}</form>;
}

const honeypot = () => document.querySelector('input[name="website"]');

// The provider brings a toaster along, which asks the browser about the
// visitor's colour preference. jsdom has no answer to give
const stubMatchMedia = () => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  })) as unknown as typeof window.matchMedia;
};

describe('useHumanCheck', () => {
  beforeEach(() => {
    stubMatchMedia();
    render_.mockReset().mockReturnValue('widget-1');
    vi.mocked(loadTurnstile).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides the honeypot from people without hiding it from a script', () => {
    render(<Form />, { wrapper: withSite(null) });

    const field = honeypot();

    expect(field).toBeTruthy();
    // Out of the tab order and out of the accessibility tree, but still in the
    // document — `display: none` is what a script would skip
    expect(field?.getAttribute('tabindex')).toBe('-1');
    expect(field?.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('draws no widget and asks Cloudflare for nothing without a key', () => {
    render(<Form />, { wrapper: withSite(null) });

    expect(loadTurnstile).not.toHaveBeenCalled();
    // Nothing to solve, so the form is free to send
    expect(latest.solved).toBe(true);
  });

  it('waits for a widget to be solved before the form may send', async () => {
    render(<Form />, { wrapper: withSite({ siteKey: 'site-key' }) });

    await vi.waitFor(() => expect(render_).toHaveBeenCalled());

    expect(latest.solved).toBe(false);
    expect(latest.proof().token).toBe('');

    const [, options] = render_.mock.calls[0];
    options.callback('a-token');

    await vi.waitFor(() => expect(latest.solved).toBe(true));
    expect(latest.proof().token).toBe('a-token');
  });

  it('clears a token that expired, so a stale one is never sent', async () => {
    render(<Form />, { wrapper: withSite({ siteKey: 'site-key' }) });

    await vi.waitFor(() => expect(render_).toHaveBeenCalled());

    const [, options] = render_.mock.calls[0];
    options.callback('a-token');
    await vi.waitFor(() => expect(latest.solved).toBe(true));

    options['expired-callback']();

    await vi.waitFor(() => expect(latest.solved).toBe(false));
  });

  it('loads no third party into a form drawn as an example', () => {
    render(<Form disabled />, { wrapper: withSite({ siteKey: 'site-key' }) });

    expect(loadTurnstile).not.toHaveBeenCalled();
    expect(latest.solved).toBe(true);
    // The example still carries the honeypot, so nothing about the markup
    // changes between the gallery and a live site
    expect(honeypot()).toBeTruthy();
  });

  it('reports what the visitor filled in, and when the form was drawn', () => {
    const drawn = 1_800_000_000_000;
    vi.useFakeTimers({ now: drawn });

    render(<Form />, { wrapper: withSite(null) });

    const field = honeypot() as HTMLInputElement;
    field.value = 'https://buy-things.example';

    expect(latest.proof()).toEqual({
      token: '',
      honeypot: 'https://buy-things.example',
      drawnAt: drawn
    });
  });
});
