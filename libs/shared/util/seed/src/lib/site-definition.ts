import type {
  CalloutBlock,
  ContentBlock,
  FeatureSectionBlock,
  FileAreaBlock,
  FormBlock,
  HeroBlock,
  ImageBlock,
  Page,
  Post,
  ReusableContentBlock,
  SiteSetting,
  Tag,
  TestimonialBlock
} from '@codeware/shared/util/payload-types';
import type { TailwindColor } from '@codeware/shared/util/tailwind';
import type * as HeroIcons from '@heroicons/react/20/solid';

import type { BundledMediaFile } from './bundled-media';

// Type-only, so the icon package is erased rather than pulled in. A workspace
// boundary would forbid reaching into the ui lib that owns the same union;
// an npm package is nobody's layer

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

/**
 * Payload's own per-row bookkeeping, which a definition never states.
 *
 * Distributive on purpose. `Omit` over a union keeps only the keys every member
 * shares, which quietly collapsed twelve block types into their common fields —
 * a definition could then state a `hero` but not its `eyebrow`. The
 * `T extends unknown` clause maps each member separately.
 */
type Authored<T> = T extends unknown ? Omit<T, 'id' | 'blockName'> : never;

type LayoutBlock = Page['layout'][number];

/** The blocks that point at a document, and so cannot be stated as-is. */
type ReferencingBlock =
  | CalloutBlock
  | ContentBlock
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
 * `card`, `code`, `feature-cards`, `pill-list`, `posts`, `showcase`,
 * `social-media`, `spacing` and `tours`.
 */
export type PlainBlockDefinition = Authored<
  Exclude<LayoutBlock, ReferencingBlock>
>;

/** The plain blocks, named so a new one cannot slip in unclassified. */
type PlainBlockType =
  | 'about'
  | 'block-gallery'
  | 'card'
  | 'code'
  | 'feature-cards'
  | 'pill-list'
  | 'posts'
  | 'showcase'
  | 'social-media'
  | 'spacing'
  | 'theme-studio'
  | 'tours';

type UnclassifiedBlockType = Exclude<
  LayoutBlock['blockType'],
  PlainBlockType | ReferencingBlock['blockType']
>;

/**
 * Fails to compile when Payload gains a layout block nobody has classified.
 *
 * Without it a new block that points at a document lands in
 * `PlainBlockDefinition` by omission: its reference field keeps the generated
 * `number | Document` type, a definition would have to state a database id, and
 * `resolveBlockReferences` would never resolve it. That compiles and passes.
 *
 * Add the block to `ReferencingBlock` if it points at a document, or to
 * `PlainBlockType` if it does not.
 */
export type AssertEveryBlockClassified<
  TUnclassified extends never = UnclassifiedBlockType
> = TUnclassified;

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

/**
 * Body text, stated as markdown.
 *
 * Payload stores rich text as Lexical, which is a tree nobody writes by hand —
 * a definition carrying it would be unreadable, and unreadable is the one thing
 * this format cannot be. So markdown is resolved like any other reference: the
 * definition says what it means, the apply produces what Payload stores.
 */
export type RichTextRef = { markdown: string };

/**
 * A person, named the way a person is.
 *
 * Users are not stated by a definition — they belong to the workspace, not to
 * the site — so this resolves against the tenant's existing users rather than
 * against the definition, the way reusable content does.
 */
export type UserRef = { lookupEmail: string };

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
/** Two things to resolve: the form it points at, and its intro copy. */
export type FormBlockDefinition = Omit<
  WithRef<FormBlock, 'form', FormRef>,
  'introContent'
> & {
  introContent?: RichTextRef | null;
};
export type ReusableContentBlockDefinition = WithRef<
  ReusableContentBlock,
  'reusableContent',
  ReusableContentRef
>;

/**
 * Columns of body text.
 *
 * `blocks` is deliberately left out: a column can nest a form, an image or
 * reusable content, and each of those needs its own reference treatment before
 * a definition could state one. Omitting it makes the attempt a type error
 * rather than a database id smuggled into a nested block.
 */
export type ContentBlockDefinition = Omit<Authored<ContentBlock>, 'columns'> & {
  columns?: Array<{
    size?: NonNullable<ContentBlock['columns']>[number]['size'];
    richText?: RichTextRef | null;
  }> | null;
};

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
  | ContentBlockDefinition
  | ReusableContentBlockDefinition
  | TestimonialBlockDefinition
  | FileAreaBlockDefinition;

export type MediaDefinition = {
  /**
   * What blocks and pages refer to this image by.
   *
   * Name one of the files that ship with the seed and the apply knows where it
   * is — a typo is then a compile error rather than a failed upload. Any other
   * name needs `filePath` to say where it comes from.
   */
  filename: BundledMediaFile | (string & {});
  alt: string;
  /** An absolute path or an http(s) URL. Optional for a bundled file */
  filePath?: string;
  tags?: Array<TagRef>;
  /**
   * Served without authentication.
   *
   * Access control, not a detail: a file area's downloads and the images
   * inside a document are fetched by a browser that carries no api key, so
   * they are unreachable without this. Defaults to false, like the field.
   */
  external?: boolean;
};

/** What the admin's icon picker offers */
export type HeroIconName = keyof typeof HeroIcons;

export type TagDefinition = {
  name: string;
  slug: string;
  /**
   * The colour and icon its pill is drawn with, which a site would miss.
   *
   * Narrower than the generated type, which says `string` because Payload
   * cannot express what its own icon and colour pickers accept.
   */
  brand?: {
    icon?: HeroIconName | null;
    color?: TailwindColor | null;
  };
};
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
  /** Resolved against the tenant's users, who a definition never states */
  authors?: Array<UserRef>;
  /** ISO date. Posts are listed newest first, so a fixed date keeps an order */
  createdAt?: string;
};

/** A navigation entry points at a page or post this definition states. */
export type NavigationItemDefinition = {
  reference: { relationTo: 'pages' | 'posts'; lookupSlug: string };
  label?: string;
};

/**
 * A contact form, as the platform builds one.
 *
 * Deliberately narrow: `ensureForm` makes a single-email-field contact form and
 * nothing else, so a definition can only state what that accepts. A richer form
 * is a change to the platform before it is a change to this type — promising
 * one here would produce a definition the apply cannot honour.
 */
export type FormDefinition = {
  /** Stable lookup key, and what a `form` block points at */
  title: string;
  emailLabel: string;
  emailPlaceholder: string;
  submitLabel: string;
  /** Shown after a successful send */
  confirmation: string;
  /** Subject of the notification to the workspace */
  subject: string;
  /**
   * Where a submission is sent.
   *
   * Optional, because a workspace can set a generic recipient in its site
   * settings and let every form fall back to it. Stating it here keeps the
   * form self-contained, which matters when it is created before those
   * settings exist.
   */
  emailTo?: string;
};

/** Everything a definition may say about the site's own settings. */
export type SiteSettingsDefinition = {
  // Partial: a definition states the settings it cares about and leaves the
  // rest as the workspace has them
  general?: Partial<
    Omit<NonNullable<SiteSetting['general']>, 'landingPage' | 'icon'>
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
