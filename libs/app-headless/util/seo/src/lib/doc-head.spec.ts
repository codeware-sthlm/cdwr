import type { DocData } from '@codeware/shared/util/payload-utils';
import { describe, expect, it } from 'vitest';

import { type HeadRoot, docHead } from './doc-head';

const root = (landingPageId: number | null): HeadRoot => ({
  ok: true,
  site: {
    appName: 'Codeware',
    landingPageId,
    locale: 'en',
    origin: 'https://codeware.se',
    payloadUrl: 'https://cms.codeware.se'
  }
});

const page = (id: number, slug: string): DocData => ({
  collection: 'pages',
  blocksData: {},
  doc: {
    id,
    slug,
    name: slug,
    layout: [],
    visibility: 'public',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
});

describe('docHead', () => {
  it('canonicalises the landing page reached by its slug to the root', () => {
    const head = docHead(root(1), {
      doc: page(1, 'home')
    });

    expect(head.links).toEqual([
      { rel: 'canonical', href: 'https://codeware.se/' }
    ]);
  });

  it('keeps the slug of any other page', () => {
    const head = docHead(root(1), {
      doc: page(2, 'about')
    });

    expect(head.links).toEqual([
      { rel: 'canonical', href: 'https://codeware.se/about' }
    ]);
  });
});
