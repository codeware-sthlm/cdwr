import type {
  CalloutBlock,
  FeatureSectionBlock,
  FileAreaBlock,
  FormBlock,
  HeroBlock,
  ImageBlock,
  Page,
  Post,
  ReusableContentBlock,
  SiteSetting,
  TestimonialBlock
} from '@codeware/shared/util/payload-types';

/**
 * One site, stated as data.
 *
 * Deliberately **not** `SeedData`. That schema names a document's tenant by
 * `lookupApiKey` and its fixtures carry those keys as literals, which is right
 * for a seed that creates its own tenants and impossible for a real one: the
 * tenant already exists and its key is a production secret. A definition
 * describes content and carries no identity at all — the tenant is named when
 * the definition is applied.
 *
 * Authored as TypeScript rather than JSON, so the compiler checks a block's
 * shape against the same generated types Payload renders from. What a
 * definition cannot express, the platform cannot render.
 */

/** Payload's own per-row bookkeeping, which a definition never states. */
type Authored<T> = Omit<T, 'id' | 'blockName'>;

type LayoutBlock = Page['layout'][number];

/** The blocks that point at a document, and so cannot be stated as-is. */
type ReferencingBlock =
  | CalloutBlock
  | FeatureSectionBlock
  | FileAreaBlock
  | FormBlock
  | HeroBlock
  | ImageBlock
  | ReusableContentBlock
  | TestimonialBlock;

/**
 * Everything else, taken straight from the generated types.
 *
 * Nothing in these blocks refers to another document, so there is nothing to
 * resolve and no reason to restate them here — `about`, `block-gallery`,
 * `card`, `code`, `content`, `feature-cards`, `pill-list`, `posts`,
 * `showcase`, `social-media`, `spacing` and `tours`.
 */
export type PlainBlockDefinition = Authored<
  Exclude<LayoutBlock, ReferencingBlock>
>;

/**
 * How a definition points at something it also defines.
 *
 * Ids do not exist until the apply creates the documents, so a definition names
 * its own content the way a person would. The same indirection `SeedData` uses,
 * minus the tenant.
 */
export type MediaRef = { lookupFilename: string };
export type TagRef = { lookupSlug: string };
export type FormRef = { lookupTitle: string };
export type ReusableContentRef = { lookupSlug: string };

/** Replaces a block's document field with the reference a definition states. */
type WithRef<TBlock, TField extends keyof TBlock, TRef> = Omit<
  Authored<TBlock>,
  TField
> & { [K in TField]?: TRef | null };

export type HeroBlockDefinition = WithRef<HeroBlock, 'media', MediaRef>;
export type CalloutBlockDefinition = WithRef<CalloutBlock, 'image', MediaRef>;
export type ImageBlockDefinition = WithRef<ImageBlock, 'media', MediaRef>;
export type FeatureSectionBlockDefinition = WithRef<
  FeatureSectionBlock,
  'media',
  MediaRef
>;
export type FormBlockDefinition = WithRef<FormBlock, 'form', FormRef>;
export type ReusableContentBlockDefinition = WithRef<
  ReusableContentBlock,
  'reusableContent',
  ReusableContentRef
>;

/** Two media fields rather than one. */
export type TestimonialBlockDefinition = Omit<
  Authored<TestimonialBlock>,
  'avatar' | 'logo'
> & {
  avatar?: MediaRef | null;
  logo?: MediaRef | null;
};

/** A media field and a list of tags. */
export type FileAreaBlockDefinition = Omit<
  Authored<FileAreaBlock>,
  'media' | 'tags'
> & {
  media?: MediaRef | null;
  tags?: Array<TagRef> | null;
};

/** Any block a definition may place on a page. */
export type BlockDefinition =
  | PlainBlockDefinition
  | HeroBlockDefinition
  | CalloutBlockDefinition
  | ImageBlockDefinition
  | FeatureSectionBlockDefinition
  | FormBlockDefinition
  | ReusableContentBlockDefinition
  | TestimonialBlockDefinition
  | FileAreaBlockDefinition;

export type MediaDefinition = {
  /** What blocks and pages refer to this image by */
  filename: string;
  alt: string;
  /** An absolute path or an http(s) URL; the apply uploads either */
  filePath: string;
  tags?: Array<TagRef>;
};

export type TagDefinition = { name: string; slug: string };
export type CategoryDefinition = { name: string; slug: string };

export type PageDefinition = Pick<Page, 'name'> & {
  slug: string;
  header?: Page['header'];
  visibility?: Page['visibility'];
  layout: Array<BlockDefinition>;
};

export type PostDefinition = Pick<Post, 'title'> & {
  slug: string;
  /** Markdown, converted to Lexical on apply — as the seed already does */
  content: string;
  visibility?: Post['visibility'];
  categories?: Array<{ lookupSlug: string }>;
  heroImage?: MediaRef;
};

/** A navigation entry points at a page or post this definition states. */
export type NavigationItemDefinition = {
  reference: { relationTo: 'pages' | 'posts'; lookupSlug: string };
  label?: string;
};

/**
 * The form-builder form a `form` block renders.
 *
 * Fields are left as the plugin types them; the apply hands them straight to
 * `ensureForm`.
 */
export type FormDefinition = {
  title: string;
  fields?: NonNullable<unknown>;
  confirmationMessage?: string;
};

/** Everything a definition may say about the site's own settings. */
export type SiteSettingsDefinition = {
  general?: Omit<
    NonNullable<SiteSetting['general']>,
    'landingPage' | 'icon'
  > & {
    landingPage?: { lookupSlug: string };
  };
  footer?: SiteSetting['footer'];
  legal?: {
    privacyPage?: { lookupSlug: string };
    termsPage?: { lookupSlug: string };
  };
};

/**
 * A whole site, stated as data and applied to a tenant that already exists.
 *
 * Only `name` and `pages` are required. Everything a definition leaves out is
 * left alone on apply rather than cleared: a definition is a statement about
 * what should exist, not an assertion that nothing else may.
 */
export type SiteDefinition = {
  /** Identifies the definition itself, never the tenant it is applied to */
  name: string;
  /** What this definition is for, in a sentence */
  description?: string;
  tags?: Array<TagDefinition>;
  categories?: Array<CategoryDefinition>;
  media?: Array<MediaDefinition>;
  forms?: Array<FormDefinition>;
  pages: Array<PageDefinition>;
  posts?: Array<PostDefinition>;
  navigation?: Array<NavigationItemDefinition>;
  siteSettings?: SiteSettingsDefinition;
};
