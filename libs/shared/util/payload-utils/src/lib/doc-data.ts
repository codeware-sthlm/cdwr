import type {
  CollectionSlug,
  Page,
  Post,
  Tour
} from '@codeware/shared/util/payload-types';

import type { BlocksData } from './blocks-data';

/**
 * Whether a dynamic route can render a collection's documents.
 *
 * Using a record to make sure all collections are included and not forgotten —
 * adding one to the content model fails the build here until it gets a verdict.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- read as a type below
const renderable = {
  categories: false,
  faq: false,
  'custom-components': false,
  'custom-themes': false,
  'form-submissions': false,
  forms: false,
  media: false,
  navigation: false,
  pages: true,
  places: false,
  'platform-labels': false,
  'platform-settings': false,
  posts: true,
  'reusable-content': false,
  'site-settings': false,
  'stock-media': false,
  tags: false,
  tenants: false,
  'tour-signups': false,
  tours: true,
  users: false
} as const satisfies Record<CollectionSlug, boolean>;

/** Collections a dynamic route serves. */
export type RenderableCollection = {
  [K in keyof typeof renderable]: (typeof renderable)[K] extends true
    ? K
    : never;
}[keyof typeof renderable];

/** What each renderable collection needs to render. */
type DocPayloads = {
  pages: { doc: Page; blocksData: BlocksData };
  posts: { doc: Post };
  tours: { doc: Tour };
};

/**
 * A fetched document, tagged with the collection it came from.
 *
 * Indexing `DocPayloads` fails the build for a collection turned renderable
 * before its document shape is declared.
 */
export type DocData = {
  [K in RenderableCollection]: { collection: K } & DocPayloads[K];
}[RenderableCollection];

/** The tenant's landing page document with the data its blocks need. */
export type LandingDoc = Extract<DocData, { collection: 'pages' }>;
