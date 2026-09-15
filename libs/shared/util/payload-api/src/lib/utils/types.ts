import type {
  NavigationReferenceCollection,
  RestApiMethod,
  SiteSettingsFooterContact
} from '@codeware/shared/util/payload-types';
import type { TypedLocale } from 'payload';

/**
 * Footer content ready for rendering.
 */
export type FooterData = {
  /**
   * Application name, rendered as the brand mark of the expanded footer.
   */
  appName: string;

  /**
   * Contact details and social media links.
   */
  contact: Array<SiteSettingsFooterContact>;

  /**
   * Copyright text where `{year}` is yet to be replaced,
   * or `null` when the copyright line is turned off.
   */
  copyright: string | null;

  /**
   * Links to display, resolved from the navigation tree or from custom links.
   */
  links: Array<FooterLink>;

  /**
   * Links to the privacy and terms pages, shown beside the copyright whatever
   * the link source. Only published pages are included.
   */
  legalLinks: Array<FooterLink>;

  /**
   * Whether to display the running release of the app.
   */
  showVersion: boolean;

  /**
   * Short text above the links, or `null` when not set.
   */
  tagline: string | null;

  /**
   * How much room the footer takes: a single centered row (`compact`),
   * links and contacts on one row (`standard`) or columns (`expanded`).
   */
  variant: FooterVariant;
};

/**
 * Footer layout size.
 */
export type FooterVariant = 'compact' | 'standard' | 'expanded';

/**
 * Footer link item.
 */
export type FooterLink = {
  /**
   * Unique identifier for the link.
   */
  key: string;

  /**
   * Link label in the language declared in the request.
   */
  label: string;

  /**
   * Whether to open the link in a new tab.
   */
  newTab: boolean;

  /**
   * Local path or absolute URL to navigate to.
   */
  url: string;
};

/**
 * Available request options depending on the request method.
 */
export type MethodOptions<T extends RestApiMethod> = T extends 'GET'
  ? {
      /**
       * The depth of the request.
       * @default 2
       *
       * @todo
       * TODO: Depth depends on the query and should not be client knowledge.
       * Possibly a depth override for edge cases but otherwise the value
       * should be set dynamically by this api.
       */
      depth?: number;

      /**
       * The limit of the request, must be greater than 0 when provided.
       */
      limit?: number;

      /**
       * The query to invoke the request with.
       * @example 'where[slug][equals]=home'
       */
      query?: string;
    }
  : {
      body: Record<string, unknown>;
    };

/**
 * Navigation tree item.
 */
export type NavigationItem = {
  /**
   * The collection for the navigation item.
   */
  collection: NavigationReferenceCollection;

  /**
   * Unique identifier for the navigation item.
   */
  key: string;

  /**
   * Navigation label in the language declared in the request.
   */
  label: string;

  /**
   * The URL of the navigation item as a `collection/slug` string.
   *
   * Use `findDoc` to fetch the document from the CMS.
   */
  url: string;
};

/**
 * Base options for all requests.
 */
export type RequestBaseOptions = RequestInitOptions & {
  /**
   * The URL of the Payload CMS API host.
   * @example 'https://payload-cms.com'
   */
  apiUrl: string;

  /**
   * The locale for the request.
   * @example 'en'
   */
  locale: TypedLocale;

  /**
   * Whether to enable debug logging on requests.
   * @default false
   */
  debug?: boolean;
};

/**
 * @internal
 * `fetch` request init options.
 */
export type RequestInitOptions = {
  /**
   * Optional headers to include in the request.
   *
   * @default undefined
   */
  headers?: RequestInit['headers'];

  /**
   * Whether to allow HTTP-only cookies depending on client and server domains.
   *
   * When the client is on a different domain than the Payload API and `useSignature` is provided,
   * the value should be set to `'include'`.
   *
   * @default undefined
   */
  requestCredentials?: RequestInit['credentials'];

  /**
   * Enable signature verification for the request
   * by providing the required application details.
   *
   * @default undefined
   */
  signatureVertification?: {
    deployEnv: string;
    deviceId: string;
    secret: string;
    tenantId: string;
    /**
     * Browser user agent to include in the signature.
     *
     * Set to `null` when the request is invoked from a server-side context
     * without access to the request object.
     * The user agent will be set to `'SSR'` in this case.
     *
     * @example
     * ```ts
     * const userAgent = request.headers.get('User-Agent')
     * ```
     */
    userAgent: string | null;
  };

  /**
   * Enable API key authorization for the request
   * by providing the tenant API key for the application.
   *
   * @default undefined
   */
  tenantApiKey?: string;
};

/**
 * @internal
 * Full request options depending on the request method.
 */
export type RequestOptions = RequestBaseOptions &
  (
    | ({ method: 'GET' } & MethodOptions<'GET'>)
    | ({ method: 'POST' } & MethodOptions<'POST'>)
  );
