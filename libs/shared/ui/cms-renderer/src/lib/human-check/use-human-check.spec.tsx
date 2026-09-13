import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PayloadProvider,
  type PayloadValue
} from '../providers/PayloadProvider';

import { useHumanCheck } from './use-human-check';

const render_ = vi.fn();
const reset_ = vi.fn();

vi.mock('./turnstile', () => ({
  loadTurnstile: vi.fn(async () => ({
    render: render_,
    remove: vi.fn(),
    reset: reset_
  }))
}));

const { loadTurnstile } = await import('./turnstile');

/** Only what the hook reads; the rest of the contract is not exercised here. */
const withSite = (humanCheckSiteKey: PayloadValue['humanCheckSiteKey']) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <PayloadProvider
        value={{ colorScheme: 'light', humanCheckSiteKey } as PayloadValue}
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

const honeypot = () =>
  document.querySelector(String.raw`input[name="cdwr-hp"]`);

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
    reset_.mockReset();
    render_.mockReset().mockReturnValue('widget-1');
    vi.mocked(loadTurnstile).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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
    render(<Form />, { wrapper: withSite('site-key') });

    await vi.waitFor(() => expect(render_).toHaveBeenCalled());

    expect(latest.solved).toBe(false);
    expect(latest.proof().token).toBe('');

    const [, options] = render_.mock.calls[0];
    options.callback('a-token');

    await vi.waitFor(() => expect(latest.solved).toBe(true));
    expect(latest.proof().token).toBe('a-token');
  });

  it('clears a token that expired, so a stale one is never sent', async () => {
    render(<Form />, { wrapper: withSite('site-key') });

    await vi.waitFor(() => expect(render_).toHaveBeenCalled());

    const [, options] = render_.mock.calls[0];
    options.callback('a-token');
    await vi.waitFor(() => expect(latest.solved).toBe(true));

    options['expired-callback']();

    await vi.waitFor(() => expect(latest.solved).toBe(false));
  });

  it('throws the spent token away and asks the widget for another', async () => {
    render(<Form />, { wrapper: withSite('site-key') });

    await vi.waitFor(() => expect(render_).toHaveBeenCalled());

    const [, options] = render_.mock.calls[0];
    options.callback('a-token');
    await vi.waitFor(() => expect(latest.solved).toBe(true));

    // A token may be verified once, so a second attempt must not reuse it
    latest.reset();

    await vi.waitFor(() => expect(latest.solved).toBe(false));
    expect(latest.proof().token).toBe('');
    expect(reset_).toHaveBeenCalledWith('widget-1');
  });

  it('has nothing to reset where no widget is drawn', () => {
    render(<Form />, { wrapper: withSite(null) });

    latest.reset();

    expect(reset_).not.toHaveBeenCalled();
    expect(latest.solved).toBe(true);
  });

  it('says so when the check cannot load, rather than leaving a dead form', async () => {
    // What a content blocker refusing Cloudflare's script looks like from here
    vi.mocked(loadTurnstile).mockResolvedValueOnce(null);

    render(<Form />, { wrapper: withSite('site-key') });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('could not load');
    // Still shut — sending without a token would only be refused
    expect(latest.solved).toBe(false);
  });

  it('says so when the script loads but cannot draw the widget', async () => {
    render_.mockImplementationOnce(() => {
      throw new Error('Invalid sitekey');
    });

    render(<Form />, { wrapper: withSite('site-key') });

    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('takes the message away when an erroring widget recovers', async () => {
    render(<Form />, { wrapper: withSite('site-key') });

    await vi.waitFor(() => expect(render_).toHaveBeenCalled());
    const [, options] = render_.mock.calls[0];

    options['error-callback']();
    expect(await screen.findByRole('alert')).toBeTruthy();

    options.callback('a-token');

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(latest.solved).toBe(true);
  });

  it('loads no third party into a form drawn as an example', () => {
    render(<Form disabled />, { wrapper: withSite('site-key') });

    expect(loadTurnstile).not.toHaveBeenCalled();
    expect(latest.solved).toBe(true);
    // The example still carries the honeypot, so nothing about the markup
    // changes between the gallery and a live site
    expect(honeypot()).toBeTruthy();
  });

  it('reports what the visitor filled in, and how long they took', () => {
    let clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);

    render(<Form />, { wrapper: withSite(null) });

    const field = honeypot() as HTMLInputElement;
    field.value = 'https://buy-things.example';
    clock = 6500;

    expect(latest.proof()).toEqual({
      token: '',
      honeypot: 'https://buy-things.example',
      elapsedMs: 5500
    });
  });

  it('measures the gap on a clock the visitor cannot skew', () => {
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);

    render(<Form />, { wrapper: withSite(null) });

    // The wall clock jumping backwards mid-form — a correction, a timezone
    // change, a laptop waking up — must not make the submission look instant
    vi.setSystemTime(new Date(2000, 0, 1));
    clock = 4000;

    expect(latest.proof().elapsedMs).toBe(4000);
  });
});
