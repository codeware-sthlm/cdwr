import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeStudioBlock } from './ThemeStudioBlock';

const embed = vi.fn();

vi.mock('./ThemeStudioEmbed', () => {
  embed();
  return { default: () => <p>The studio</p> };
});

const jsdomMatchMedia = window.matchMedia;

const viewport = (matches: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  })) as unknown as typeof window.matchMedia;
};

const block = (
  <ThemeStudioBlock blockType="theme-studio" startFrom="spotlight" />
);

describe('ThemeStudioBlock', () => {
  afterEach(() => {
    embed.mockClear();
    window.matchMedia = jsdomMatchMedia;
  });

  it('says the studio needs a desktop and never loads it on a phone', () => {
    viewport(false);
    render(block);

    expect(screen.getByText(/built for a desktop screen/)).toBeTruthy();
    expect(screen.queryByText('The studio')).toBeNull();
    expect(embed).not.toHaveBeenCalled();
  });

  it('loads the studio on a wide screen', async () => {
    viewport(true);
    render(block);

    expect(await screen.findByText('The studio')).toBeTruthy();
    expect(screen.queryByText(/built for a desktop screen/)).toBeNull();
  });
});
