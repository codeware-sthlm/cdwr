import type {
  CustomComponent,
  CustomComponentBlock as CustomComponentBlockProps
} from '@codeware/shared/util/payload-types';
import { cleanup, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PayloadProvider } from '../../providers/PayloadProvider';

import { ensureComponentScript, placeComponent } from './custom-component';
import { CustomComponentBlock } from './CustomComponentBlock';

const HASH = '0123456789abcdef';

const component = (build: Partial<CustomComponent['build']> = {}) =>
  ({
    id: 1,
    name: 'Counter',
    slug: 'counter',
    source: '',
    build: { status: 'ready', hash: HASH, js: 'x', css: '.a{}', ...build }
  }) as unknown as CustomComponent;

const block = (
  overrides: Partial<CustomComponentBlockProps> = {}
): CustomComponentBlockProps => ({
  component: component(),
  props: { label: 'Hi' },
  blockType: 'custom-component',
  ...overrides
});

// Only what the block and the provider read
const value = { payloadUrl: 'https://cms.test' } as never;

const renderBlock = (props: CustomComponentBlockProps) =>
  render(
    <PayloadProvider value={value}>
      <CustomComponentBlock {...props} />
    </PayloadProvider>
  );

describe('placeComponent', () => {
  it('names the element from the slug', () => {
    expect(placeComponent(component())).toEqual({
      tagName: 'cdwr-x-counter',
      hash: HASH,
      css: '.a{}'
    });
  });

  it.each([
    ['an unpopulated id', 1],
    ['no component', undefined],
    ['no hash', component({ hash: null })],
    ['a malformed hash', component({ hash: '"><script>' })]
  ])('is null for %s', (_name, input) => {
    expect(placeComponent(input)).toBeNull();
  });

  it('still renders after a failed rebuild kept the old bundle', () => {
    expect(placeComponent(component({ status: 'failed' }))).not.toBeNull();
  });
});

describe('ensureComponentScript', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  const target = { tagName: 'cdwr-x-counter', hash: HASH };

  it('adds the script once per hash', () => {
    expect(ensureComponentScript(document, target, '/a.js')).toBe(true);
    expect(ensureComponentScript(document, target, '/a.js')).toBe(false);
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
    expect(document.head.querySelector('script')?.getAttribute('src')).toBe(
      '/a.js'
    );
  });

  it('adds nothing when the element is already defined', () => {
    customElements.define('cdwr-x-defined', class extends HTMLElement {});

    expect(
      ensureComponentScript(
        document,
        { tagName: 'cdwr-x-defined', hash: HASH },
        '/a.js'
      )
    ).toBe(false);
    expect(document.head.querySelector('script')).toBeNull();
  });
});

// The provider's toaster is also in the container, so look for the block's own
const expectNothingPlaced = (container: HTMLElement) => {
  expect(container.querySelector('cdwr-x-counter')).toBeNull();
  expect(document.head.querySelector('style')).toBeNull();
};

describe('CustomComponentBlock', () => {
  beforeEach(() => {
    // The provider's toaster asks the browser about the colour preference,
    // which jsdom cannot answer
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

  afterEach(() => {
    cleanup();
    document.head.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders nothing for an unpopulated component', () => {
    const { container } = renderBlock(block({ component: 1 }));

    expectNothingPlaced(container);
  });

  it('renders nothing without a build', () => {
    const { container } = renderBlock(
      block({ component: component({ hash: null, js: null }) })
    );

    expectNothingPlaced(container);
  });

  it('renders the element with its props and the stylesheet', () => {
    const { container } = renderBlock(block());

    const element = container.querySelector('cdwr-x-counter');
    expect(element?.getAttribute('props')).toBe('{"label":"Hi"}');
    expect(document.head.querySelector('style')?.textContent).toBe('.a{}');
  });

  it('sends an empty object when the block has no props', () => {
    const { container } = renderBlock(block({ props: undefined }));

    expect(
      container.querySelector('cdwr-x-counter')?.getAttribute('props')
    ).toBe('{}');
  });

  it('server-renders the stylesheet and the empty element only', () => {
    const html = renderToString(
      <PayloadProvider value={value}>
        <CustomComponentBlock {...block()} />
      </PayloadProvider>
    );

    expect(html).toContain('<cdwr-x-counter');
    expect(html).toContain('.a{}');
    expect(html).not.toContain('<script');
  });
});
