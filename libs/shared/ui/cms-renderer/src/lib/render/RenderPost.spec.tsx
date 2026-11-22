import type { Post } from '@codeware/shared/util/payload-types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  PayloadProvider,
  type PayloadValue
} from '../providers/PayloadProvider';

import { RenderPost } from './RenderPost';

const post = {
  id: 1,
  title: 'A post',
  createdAt: '2026-11-22T12:00:00.000Z',
  updatedAt: '2026-11-22T12:00:00.000Z',
  content: null
} as unknown as Post;

const setup = (locale: string, listingPath: string | null = '/posts') => {
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
  return render(
    <PayloadProvider
      value={{ locale, navigate: vi.fn() } as unknown as PayloadValue}
    >
      <RenderPost post={post} listingPath={listingPath} />
    </PayloadProvider>
  );
};

describe('RenderPost', () => {
  it('formats the date and labels the back link in Swedish', () => {
    setup('sv');

    expect(screen.getByText('22 november 2026')).toBeTruthy();
    expect(screen.getByLabelText('Tillbaka till artiklarna')).toBeTruthy();
  });

  it('formats the date and labels the back link in English', () => {
    setup('en');

    expect(screen.getByText('November 22, 2026')).toBeTruthy();
    expect(screen.getByLabelText('Go back to articles')).toBeTruthy();
  });

  it('leaves out the back link without a listing path', () => {
    setup('en', null);

    expect(screen.queryByRole('link')).toBeNull();
  });
});
