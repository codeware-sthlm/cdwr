import type { TenantRuntimeConfig } from '@codeware/shared/util/payload-types';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';

type FallbackLocale = TenantRuntimeConfig['fallbackLocale'];

export type AppLoadContext = {
  deviceId: string;
  tenantApiKey: string;
  /** The tenant slug */
  tenantId: string;
  /**
   * The tenant configuration fetch during bootstrap.
   * Can be null if the tenant configuration could not be resolved.
   */
  tenantConfig: TenantRuntimeConfig | null;
  /** Fallback locale when tenant configuration is not available */
  fallbackLocale: FallbackLocale;
  /** Per-request CSP nonce for scripts Remix renders */
  cspNonce: string;
};

/** Action function arguments with properly typed context */
export type TypedActionFunctionArgs = Pick<
  ActionFunctionArgs,
  'params' | 'request'
> & {
  context: AppLoadContext;
};

/** Loader function arguments with properly typed context */
export type TypedLoaderFunctionArgs = Pick<
  LoaderFunctionArgs,
  'params' | 'request'
> & {
  context: AppLoadContext;
};
