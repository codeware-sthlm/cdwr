import type {
  PlatformLabel,
  Tenant,
  TenantRole,
  User
} from '@codeware/shared/util/payload-types';

import type { BundledStockMediaFile } from './bundled-media';

/**
 * What no single site owns, stated as data and applied by
 * `applyPlatformDefinition`: the tenants, their users, the shared
 * vocabularies editors pick labels from, the stock photo library, the FAQ
 * and what self-serve signup needs. A site definition is applied afterwards,
 * against the tenant this created.
 */

/** The locales a workspace can be seeded in. */
type Locale = Tenant['supportedLocales'][number];

/**
 * A shared vocabulary entry — what a place is, or what a stock photo shows.
 *
 * Listed explicitly rather than worked out from what uses it, since the uses
 * live in other definitions. A site definition's place kind resolves here by
 * name.
 */
export type PlatformLabelDefinition = {
  type: PlatformLabel['type'];
  name: string;
  /** Shown wherever the label appears. An admin can change it later; this is only a starting point */
  icon: string;
  description?: string;
};

/** One image in the platform's shared stock library. */
export type StockMediaDefinition = {
  filename: BundledStockMediaFile;
  alt: string;
  /** A `stock-subject` label name, resolved on apply */
  subject?: string;
  credit?: string;
  licence?: string;
};

export type FaqDefinition = {
  question: { en: string; sv: string };
  answer: { en: string; sv: string };
};

/** One seeded workspace's identity. Its content is a site definition, applied separately */
export type PlatformTenantDefinition = {
  name: string;
  slug: string;
  apiKey: string;
  /** The Infisical folder and Fly app suffix, when the tenant is deployed */
  deployment?: string;
  description: string;
  locale: Locale;
  supportedLocales: ReadonlyArray<Locale>;
};

/**
 * A platform user.
 *
 * No password: it is environment-specific, decided when the definition is
 * applied rather than stated here.
 */
export type PlatformUserDefinition = {
  name: string;
  description: string;
  email: string;
  role: User['role'];
  locale: Locale;
  /** Workspaces this user belongs to, named by slug rather than api key */
  tenants: ReadonlyArray<{
    lookupSlug: string;
    role: TenantRole;
    /** May author custom components in that workspace */
    componentDeveloper?: boolean;
  }>;
};

/**
 * One invite code for self-serve signup.
 *
 * Stated in plain here, the only place it ever is: the apply hands it to the
 * collection, which keeps the first half as a lookup and only a hash of the
 * second. A seeded code is for development and preview; production is never
 * seeded.
 */
export type PlatformInviteCodeDefinition = {
  /** `XXXX-XXXX-XXXX-XXXX` in Crockford base32, so no I, L, O or U */
  code: string;
  /** Who the code is for */
  note: string;
  maxUses: number;
  /** An ISO timestamp; omitted, the code never expires */
  expiresAt?: string;
};

/** What self-serve signup on the host needs before anyone can use it */
export type PlatformSignupDefinition = {
  /** Whether the signup page accepts invite codes at all */
  open: boolean;
  /** Gets a notice for each signup; omitted, the signup is only logged */
  notifyEmail?: string;
  inviteCodes: ReadonlyArray<PlatformInviteCodeDefinition>;
};

export type PlatformDefinition = {
  labels: ReadonlyArray<PlatformLabelDefinition>;
  stockMedia: ReadonlyArray<StockMediaDefinition>;
  faq: ReadonlyArray<FaqDefinition>;
  tenants: ReadonlyArray<PlatformTenantDefinition>;
  users: ReadonlyArray<PlatformUserDefinition>;
  signup: PlatformSignupDefinition;
};
