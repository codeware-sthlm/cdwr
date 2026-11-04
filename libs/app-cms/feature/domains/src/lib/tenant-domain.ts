import type { CertificateState } from './certificate-state';

/**
 * One custom domain row on a tenant.
 *
 * Declared structurally rather than pulled from the generated Payload types:
 * the hooks below are the reason the field exists, and typing them against a
 * file that is regenerated from the collection would make the two define each
 * other. The collection is the single source of truth for the shape; this is
 * the slice the hooks read.
 */
export type TenantDomain = {
  /** Domain without a scheme, e.g. `tours.example.com` */
  hostname?: string | null;
  /** Fly app that serves it, e.g. `cdwr-headless-moon` */
  app?: string | null;
  /** Whether the app should present itself as this domain */
  isPrimary?: boolean | null;
  /** What Fly last said, stamped by the certificate endpoint */
  certificate?: Stored<CertificateState> | null;
};

/**
 * A shape as it comes back out of the database rather than as it went in.
 *
 * Payload widens every stored field to nullable-optional, so a type that only
 * describes what is written cannot receive what is read — and it does so at
 * every level, which is why an array of objects has to be widened element by
 * element rather than treated as one opaque value. Arrays of primitives
 * (`validationErrors`) keep their element type, since there is nothing inside
 * to widen.
 */
type Stored<T> = { [K in keyof T]?: StoredValue<NonNullable<T[K]>> };

type StoredValue<V> =
  V extends Array<infer E>
    ? E extends object
      ? Array<{ [K in keyof E]?: E[K] | null }> | null
      : V | null
    : V | null;

/**
 * A tenant document, as far as the domain hooks are concerned.
 *
 * `id` is not optional: Payload's hook types require it on the document, and
 * hands the hooks a `Partial` of this for the incoming data, which is where a
 * create has no id yet.
 */
export type TenantWithDomains = {
  id: number | string;
  name?: string | null;
  domains?: Array<TenantDomain> | null;
};
