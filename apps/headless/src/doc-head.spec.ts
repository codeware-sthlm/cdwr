import type { DocData } from '@codeware/shared/util/payload-utils';
import { describe, expect, it } from 'vitest';

import { docHead } from './doc-head';
import type { Site } from './server/load-site';

const root = (landingPageId: number | null): Site => ({
  ok: true,
  site: {
    appName: 'Codeware',
    appInfo: {
      name: 'headless',
      version: '0.0.0',
      sha: '',
      deployEnv: 'test',
      buildTime: ''
    },
    chrome: 'outlined',
    colorSchemePolicy: 'system',
    customCss: '',
    fontFaceCss: '',
    iconConfig: null,
    landingPageId,
    locale: 'en',
    origin: 'https://codeware.se',
    payloadUrl: 'https://cms.codeware.se',
    stats: false,
    statsWebsiteId: null,
    theme: 'codeware',
    themes: []
  },
  landingDocJson: null,
  navigationTree: [],
  footer: null,
  signupPolicy: null
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
