import type { StripTypes } from '@codeware/shared/util/typesafe';
import type {
  ClientUser,
  FieldAccess,
  TypeWithID,
  TypedFallbackLocale,
  TypedLocale,
  User
} from 'payload';

import type {
  CardBlock,
  User as CollectionUser,
  Config,
  ContentBlock,
  Form,
  FormSubmission,
  Navigation,
  Page,
  Post,
  SiteSettingsFooter,
  SiteSettingsGeneral,
  SocialMediaBlock,
  Tenant,
  TenantsArrayField,
  Tour,
  TourItinerary
} from './payload-types';

/** Custom Payload API endpoints */
export type CustomApiEndpoint = 'palette-search' | 'tenant-config';

export type CollectionWithoutPayload = {
  [key in keyof Config['collections'] as key extends `payload${string}`
    ? never
    : key]: Config['collections'][key];
};

type CollectionWithTenantField = {
  [key in keyof CollectionWithoutPayload as CollectionWithoutPayload[key] extends {
    tenant?: (number | null) | Tenant;
  }
    ? key
    : never]: CollectionWithoutPayload[key];
};

/** Collection slugs */
export type CollectionSlug = keyof CollectionWithoutPayload;

/** Collection types */
export type CollectionType = CollectionWithoutPayload[CollectionSlug];

/** Collection slugs that have a `tenant` field */
export type CollectionTenantScopedSlug = keyof CollectionWithTenantField;

/** Collection types that have a `tenant` field */
export type CollectionTenantScopedType =
  CollectionWithTenantField[CollectionTenantScopedSlug];

/** Tenants array field item type */
export type TenantsArrayFieldItem = NonNullable<TenantsArrayField>[number];

/** Tenant role type */
export type TenantRole = NonNullable<TenantsArrayField>[number]['role'];

/** User type that can be any of the user types defined by Payload */
export type UserAny = ClientUser | CollectionUser | User;

/** Block type */
export type BlockSlug = keyof Config['blocks'];

/** Card block card details */
export type CardBlockCard = NonNullable<CardBlock['cards']>[number];

/** Content block column size */
export type ContentBlockSize = NonNullable<
  NonNullable<NonNullable<ContentBlock['columns']>[number]>['size']
>;

/** Form block type */
export type FormBlockType = NonNullable<
  NonNullable<NonNullable<Form['fields']>[number]>['blockType']
>;

/** Field access arguments type */
export type FieldAccessArgs = Parameters<FieldAccess>[0];

/** Field access response type */
export type FieldAccessResponse = ReturnType<FieldAccess>;

/** Form field type */
export type FormField = NonNullable<NonNullable<Form['fields']>[number]>;

/** Form field for a specific block type */
export type FormFieldForBlockType<T extends FormBlockType> = FormField & {
  blockType: T;
};

/** Form submission data */
export type FormSubmissionData = NonNullable<
  NonNullable<FormSubmission['submissionData']>
>;

/** Tour itinerary day */
export type TourItineraryDay = NonNullable<TourItinerary>[number];

type PageMetaDefined = NonNullable<Page['meta']>;
type PostMetaDefined = NonNullable<Post['meta']>;
type TourMetaDefined = NonNullable<Tour['meta']>;

/** Page meta type */
export type PageMeta = {
  [K in keyof PageMetaDefined]: StripTypes<PageMetaDefined[K], number | null>;
};

/** Post meta type */
export type PostMeta = {
  [K in keyof PostMetaDefined]: StripTypes<PostMetaDefined[K], number | null>;
};

/** Tour meta type */
export type TourMeta = {
  [K in keyof TourMetaDefined]: StripTypes<TourMetaDefined[K], number | null>;
};

/** Navigation reference collection */
export type NavigationReferenceCollection = NonNullable<
  NonNullable<Navigation['items']>[number]
>['reference']['relationTo'];

/** Site settings footer contact details */
export type SiteSettingsFooterContact = NonNullable<
  NonNullable<SiteSettingsFooter['contact']>[number]
>;

/** Site settings footer link item */
export type SiteSettingsFooterLink = NonNullable<
  NonNullable<SiteSettingsFooter['links']>[number]
>;

/** Site settings icon source */
export type SiteSettingsIconSource = NonNullable<
  NonNullable<SiteSettingsGeneral['icon']>['source']
>;

/** Social media block social details */
export type SocialMediaBlockSocial = NonNullable<
  NonNullable<SocialMediaBlock['social']>[number]
>;

/**
 * Serialisable icon data included in `TenantRuntimeConfig`.
 *
 * SVG path: raw markup rendered inline via dangerouslySetInnerHTML.
 * Upload path: resolved URL to the media file.
 */
export type TenantIconConfig =
  | { source: 'svg'; svgCode: string }
  | { source: 'upload'; fileUrl: string };

/**
 * A tenant-authored theme, resolved for injection into the site.
 *
 * `tokens*` are the raw CSS custom properties. They are whitelisted again on
 * the way into the stylesheet, so nothing here is assumed to be safe.
 */
export type CustomThemeConfig = {
  /** The `data-theme` value */
  slug: string;
  /** Shown in the theme selector */
  name: string;
  tokensLight: Record<string, unknown>;
  tokensDark: Record<string, unknown>;
};

/**
 * Tenant runtime configuration type.
 *
 * Containes tenant-specific details that must be determined at runtime during bootstrap,
 * before fetching any tenant-scoped collection data using the proper locale.
 */
export type TenantRuntimeConfig = {
  tenant: Tenant;
  appName: string;
  icon: TenantIconConfig | null;
  locale: TypedLocale;
  fallbackLocale: TypedFallbackLocale;
  landingPage: TypeWithID & {
    collection: Extract<CollectionSlug, 'pages'>;
  };
  /**
   * Themes this site may render, as `data-theme` values. A single entry means
   * the site shows no theme selector.
   *
   * Deliberately `string[]` rather than a union of the built-in themes: a
   * future theme studio injects tenant-authored themes at runtime, and those
   * are not known at build time.
   */
  themes: Array<string>;
  /**
   * The subset of `themes` this tenant authored, with the tokens the site has
   * to inject — a built-in theme is already in the CSS bundle, these are not.
   */
  customThemes: Array<CustomThemeConfig>;
  /** Theme rendered before the visitor chooses; always a member of `themes`. */
  defaultTheme: string;
  /**
   * Light/dark policy. `system` lets the visitor switch; `light` or `dark`
   * locks the site to that scheme and hides the switch.
   */
  colorScheme: SiteSettingsGeneral['colorScheme'];
  /**
   * How the header and its controls are drawn.
   *
   * One decision for three components — the navigation, the theme select and
   * the colour scheme switch — because a flat navigation carrying outlined
   * toggles is the one combination nobody wants, and separate settings invite
   * exactly that.
   */
  chrome: SiteSettingsGeneral['chrome'];
};

/**
 * Single document match returned by the admin `palette-search` endpoint.
 */
export type PaletteSearchResultItem = {
  /** Document id as string */
  id: string;
  /** Human-readable title; may be empty for unnamed drafts */
  title: string;
  collectionSlug: CollectionSlug;
  /** Publish status — only present for collections with drafts enabled */
  status?: 'draft' | 'published';
  /** Secondary line, e.g. slug or filename */
  meta?: string;
  updatedAt: string;
};

/**
 * Response shape of the admin `palette-search` endpoint.
 */
export type PaletteSearchResponse = {
  /** Echo of the search query, lets clients discard stale responses */
  query: string;
  /** Matches in fixed collection order; clients group by `collectionSlug` */
  results: Array<PaletteSearchResultItem>;
};

//
// Rest API utility types until we implement the official Payload SDK
//

/** REST API supported request methods */
export type RestApiMethod = 'GET' | 'POST';

/** REST API target endpoints */
export type RestApiTarget = CollectionSlug | CustomApiEndpoint;

/** REST API targets with corresponding Payload types */
export type RestApiTypes = CollectionWithoutPayload &
  Record<'palette-search', PaletteSearchResponse> &
  Record<'tenant-config', TenantRuntimeConfig>;

/** REST API expected responses for the given method and target */
export type RestApiResponse<
  Method extends RestApiMethod,
  Target extends RestApiTarget
> = Target extends CustomApiEndpoint
  ? RestApiTypes[Target]
  : Method extends 'GET'
    ? {
        docs: Array<RestApiTypes[Target]>;
      }
    : RestApiTypes[Target];
