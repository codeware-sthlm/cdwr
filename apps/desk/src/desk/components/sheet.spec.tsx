// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Sheet } from './sheet';

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

const frame = (o: { focus?: boolean; onClose?: () => void } = {}) =>
  render(
    <Sheet
      open
      title="Limit"
      sub="Agent PRs in flight"
      focus={o.focus ?? true}
      onClose={o.onClose ?? (() => undefined)}
      onClosed={() => undefined}
    >
      <p>body</p>
    </Sheet>
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Sheet', () => {
  it('opens as a dialog with its title, sub line and body', () => {
    media(false);
    frame();
    const dialog = screen.getByRole('dialog', { name: 'Limit' });
    expect(dialog.getAttribute('data-slot')).toBe('sheet-content');
    expect(dialog.textContent).toContain('Agent PRs in flight');
    expect(dialog.querySelector('.sheet-body')?.textContent).toBe('body');
  });

  it('focuses Close on open, unless told not to', () => {
    media(false);
    const { unmount } = frame();
    expect(document.activeElement?.id).toBe('sheet-close');
    unmount();
    frame({ focus: false });
    expect(document.activeElement?.id).not.toBe('sheet-close');
  });

  it('closes on Close and on Escape', () => {
    media(false);
    const onClose = vi.fn();
    frame({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape'
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('is a drawer at the phone width', () => {
    media(true);
    frame();
    const dialog = screen.getByRole('dialog', { name: 'Limit' });
    expect(dialog.getAttribute('data-slot')).toBe('drawer-content');
    expect(dialog.getAttribute('data-vaul-drawer-direction')).toBe('bottom');
  });
});
