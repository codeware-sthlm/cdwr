import { t } from '@codeware/shared/util/i18n';
import { BLOCK_META } from '@codeware/shared/util/payload-utils';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PayloadProvider,
  type PayloadValue
} from '../../providers/PayloadProvider';

import { BlockGalleryBlock } from './BlockGalleryBlock';
import type { RenderExample } from './BlockGalleryEntry';

// Two neighbours in the gallery's order, both banded and with an example. The
// stepper walks every registered block, documented or not, so they have to be
// adjacent for one step to land on the other
vi.mock('../gallery-docs', () => {
  const text = (value: string) => ({ en: value, sv: value });
  const doc = (blockType: string, band: string) => ({
    summary: text(`${blockType} summary`),
    whenToUse: text(`${blockType} when`),
    example: { blockType, band }
  });

  return {
    galleryDocs: {
      callout: doc('callout', 'none'),
      card: doc('card', 'subtle')
    }
  };
});

/** Shows the band the example was handed, which is what the gallery chose */
const Example: RenderExample = ({ blocks }) => (
  <div data-testid="example">
    {'band' in blocks[0] ? String(blocks[0].band) : 'none'}
  </div>
);

describe('BlockGalleryBlock full screen', () => {
  const locale = 'en';
  const expand = t(locale, 'gallery.expand');
  const next = t(locale, 'gallery.next');
  const labelOf = (slug: 'callout' | 'card') => BLOCK_META[slug].label.en;

  beforeEach(() => {
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
  });

  const open = () => {
    render(
      <PayloadProvider
        value={
          {
            colorScheme: 'light',
            lockedColorScheme: 'light',
            locale,
            getSearchParam: (name: string) =>
              name === 'block' ? 'callout' : null
          } as unknown as PayloadValue
        }
      >
        <BlockGalleryBlock
          blockType="block-gallery"
          mode="browser"
          render={Example}
        />
      </PayloadProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: expand }));
    return screen.getByRole('dialog');
  };

  it('keeps the dialog mounted and open when stepping to the next block', () => {
    const dialog = open();
    expect(
      within(dialog).getByRole('heading', {
        name: new RegExp(labelOf('callout'))
      })
    ).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: next }));

    const after = screen.getByRole('dialog');
    expect(after).toBe(dialog);
    expect(document.body.contains(dialog)).toBe(true);
    expect(dialog.getAttribute('data-state')).toBe('open');
    expect(
      within(dialog).getByRole('heading', { name: new RegExp(labelOf('card')) })
    ).toBeTruthy();
  });

  it('keeps the chosen band when stepping to the next block', () => {
    const dialog = open();
    const strong = t(locale, 'gallery.band.strong');

    fireEvent.click(within(dialog).getByRole('radio', { name: strong }));
    expect(
      within(dialog)
        .getByRole('radio', { name: strong })
        .getAttribute('aria-checked')
    ).toBe('true');
    expect(within(dialog).getByTestId('example').textContent).toBe('strong');

    fireEvent.click(within(dialog).getByRole('button', { name: next }));

    expect(
      within(dialog).getByRole('heading', { name: new RegExp(labelOf('card')) })
    ).toBeTruthy();
    // `card` was written with `subtle`; the visitor's pick wins
    expect(
      within(dialog)
        .getByRole('radio', { name: strong })
        .getAttribute('aria-checked')
    ).toBe('true');
    expect(within(dialog).getByTestId('example').textContent).toBe('strong');
  });
});
