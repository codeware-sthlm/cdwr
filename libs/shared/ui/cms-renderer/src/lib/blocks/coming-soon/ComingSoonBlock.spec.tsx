import type { ComingSoonBlock as ComingSoonBlockProps } from '@codeware/shared/util/payload-types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  PayloadProvider,
  type PayloadValue
} from '../../providers/PayloadProvider';

import { ComingSoonBlock } from './ComingSoonBlock';

const base: ComingSoonBlockProps = {
  blockType: 'coming-soon',
  heading: "We're building something new"
};

const setup = (props: Partial<ComingSoonBlockProps> = {}, locale = 'en') => {
  // The provider mounts a toaster, which asks the browser about colour scheme
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
  const navigate = vi.fn();
  const view = render(
    <PayloadProvider value={{ locale, navigate } as unknown as PayloadValue}>
      <ComingSoonBlock {...base} {...props} />
    </PayloadProvider>
  );
  return { navigate, ...view };
};

describe('ComingSoonBlock', () => {
  it('renders the heading', () => {
    setup();

    expect(
      screen.getByRole('heading', { name: "We're building something new" })
    ).toBeTruthy();
  });

  it('shows the opening date in the locale', () => {
    setup({ openingDate: '2027-03-01T00:00:00.000Z' });

    expect(screen.getByText(/^Opening .*2027/)).toBeTruthy();
  });

  it('shows the opening date in Swedish', () => {
    setup({ openingDate: '2027-03-01T00:00:00.000Z' }, 'sv');

    expect(screen.getByText(/^Öppnar .*2027/)).toBeTruthy();
  });

  it('has no date line without an opening date', () => {
    setup({ openingDate: '' });

    expect(screen.queryByText(/Opening/)).toBeNull();
  });

  it('links the email and the phone, with spaces stripped from the number', () => {
    setup({
      contactEmail: 'hello@example.com',
      contactPhone: '+46 8 123 456 78'
    });

    expect(
      screen
        .getByRole('link', { name: /hello@example\.com/ })
        .getAttribute('href')
    ).toBe('mailto:hello@example.com');
    expect(
      screen
        .getByRole('link', { name: /\+46 8 123 456 78/ })
        .getAttribute('href')
    ).toBe('tel:+46812345678');
  });

  it('has no button without a label or without an anchor', () => {
    const { unmount } = setup({ notifyAnchor: 'notify' });
    expect(screen.queryByRole('button')).toBeNull();
    unmount();

    setup({ notifyLabel: 'Notify me' });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('sends the button to its anchor', () => {
    window.location.hash = '';
    const { navigate } = setup({
      notifyLabel: 'Notify me',
      notifyAnchor: 'notify'
    });

    fireEvent.click(screen.getByRole('button', { name: 'Notify me' }));

    // The provider answers in-page links itself: with nothing on the page
    // registered or to scroll to, it sets the hash an overlay listens for
    expect(window.location.hash).toBe('#notify');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('draws the built-in drawing by default', () => {
    const { container } = setup();

    expect(container.querySelectorAll('svg[aria-label="Custom"]')).toHaveLength(
      0
    );
    expect(container.querySelector('section > div > svg')).not.toBeNull();
  });

  it('draws a custom illustration in its place', () => {
    const { container } = setup({
      illustration:
        '<svg viewBox="0 0 10 10" aria-label="Custom"><circle cx="5" cy="5" r="4" fill="var(--brand-500)"/></svg>'
    });

    expect(container.querySelectorAll('svg[aria-label="Custom"]')).toHaveLength(
      1
    );
    // Only the custom one, not the built-in beside it
    expect(
      container.querySelectorAll('section > div:first-child svg[viewBox]')
    ).toHaveLength(1);
  });

  it('draws nothing when the illustration is off', () => {
    const { container } = setup({
      showIllustration: false,
      illustration: '<svg viewBox="0 0 10 10" aria-label="Custom"></svg>'
    });

    expect(container.querySelector('section > div')).toBeNull();
  });
});
