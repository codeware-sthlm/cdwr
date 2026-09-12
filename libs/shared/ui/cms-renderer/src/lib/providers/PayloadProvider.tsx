'use client';
import { Toaster } from '@codeware/shared/ui/shadcn/components/sonner';
import type { SignupPolicy } from '@codeware/shared/util/payload-api';
import type {
  FormSubmission,
  TenantIconConfig
} from '@codeware/shared/util/payload-types';
import { type ReactNode, createContext, use } from 'react';

import type { AppInfo } from '../about/AppAbout';

/**
 * What the browser sends so the server can tell a person from a script.
 *
 * Collected by the renderer and passed straight through to the host's own
 * route, which is where it is checked — see `@codeware/shared/util/human-check`.
 */
export type HumanCheckProof = {
  /** Turnstile's token, empty where the site draws no widget */
  token: string;
  /** A field no person can see, so anything in it came from a script */
  honeypot: string;
  /** Epoch ms when the form was drawn */
  drawnAt: number;
};

type FormSubmitData = {
  form: FormSubmission['form'];
  humanCheck: HumanCheckProof;
} & {
  submissionData: Array<
    Pick<
      NonNullable<FormSubmission['submissionData']>[number],
      'field' | 'value'
    >
  >;
};

export type FormSubmitResponse =
  | {
      success: true;
      data: FormSubmission;
    }
  | {
      success: false;
      data: { error: string };
    };

/** What a customer sends to sign up for a tour */
export type TourSignupData = {
  tour: number;
  name: string;
  email: string;
  phone?: string;
  /** People the signup is for — the capacity unit */
  people: number;
  /**
   * Whether the customer ticked the terms box. The server stamps the time
   * itself — a client-sent timestamp would be worth nothing as a record.
   */
  acceptedTerms?: boolean;
  humanCheck: HumanCheckProof;
};

export type TourSignupResponse =
  | {
      success: true;
      /** Decided by the server from the tour's capacity, not by the client */
      data: { id: number; status: 'booked' | 'waiting' };
    }
  | {
      success: false;
      data: { error: string };
    };

export type PayloadValue = {
  /**
   * Provide the running app's build metadata (name, version, sha, deployEnv,
   * build time). Each app supplies its own — the About block renders it
   * app-agnostically via `usePayload().appInfo`.
   */
  appInfo: AppInfo;

  /**
   * Provide a tenant icon for a branded user experience.
   * This is used by components that render blocks with icons for tenants.
   *
   * Pass the icon from the tenant configuration directly - no app-level modification needed.
   * Set to `null` to suppress icon marks even when a block has it enabled.
   */
  iconConfig: TenantIconConfig | null;

  /**
   * Provide a function that returns the current URL path.
   * This is used for active route detection in navigation components.
   *
   * Example implementations:
   * - Next.js: `usePathname()` from 'next/navigation'
   * - Remix: `useLocation().pathname` from '@remix-run/react'
   * - React Router: `useLocation().pathname` from 'react-router-dom'
   *
   * @returns The current URL path (e.g., '/blog/my-post')
   */
  getCurrentPath: () => string;

  /**
   * Provide a reader for one query string parameter.
   *
   * Separate from `getCurrentPath`, which returns the path alone. Used to
   * arrive at a particular entry — `?block=hero` — without giving the
   * gallery a route of its own.
   *
   * Example implementations:
   * - Next.js: `useSearchParams().get(name)`
   * - Remix: `new URLSearchParams(useLocation().search).get(name)`
   *
   * @param name - The parameter to read
   * @returns Its value, or `null` when absent
   */
  getSearchParam: (name: string) => string | null;

  /**
   * Provide a navigate function based on your framework.
   * It's used to navigate to a path or URL.
   *
   * The `path` value can be a local path or an absolute URL.
   * The implementation is up to the app developer but it's recommended to:
   * - setup route definitions to local paths in your app
   * - apply external URL handling to absolute URLs (e.g. `window.location.href`)
   *
   * @param path - The path to navigate to.
   * @param newTab - Whether to open the link in a new tab.
   */
  navigate: (path: string, newTab?: boolean) => void;

  /**
   * Provide the fully qualified URL to Payload.
   *
   * For an external client, e.g. using web app, this should be the Payload CMS host.
   * For a tenant-scoped client, this is the app URL itself, since it serves both the frontend and the Payload API.
   *
   * This is used e.g. to render media images properly.
   *
   * Example: `'https://cms.domain.io'`
   */
  payloadUrl: string;

  /**
   * Provide a function to update the color scheme.
   * This is used by the color scheme switch component.
   *
   * Example implementations:
   * - Next.js with next-themes: `setTheme` from `useTheme()` hook
   * - Custom: Update your color scheme state/context
   *
   * @param colorScheme - The color scheme to set ('light', 'dark', or 'system')
   */
  setColorScheme: (colorScheme: 'light' | 'dark' | 'system') => void;

  /**
   * Provide a function to handle form submissions server-side.
   * This will allow for secure authentication requests via api key tokens.
   *
   * Post to a route on **your own origin** and let that route talk to Payload
   * with the api key. Two things depend on it: the tenant api key must never
   * reach the browser, and no browser request may go cross-origin to the cms —
   * the api is not reachable from other origins by design.
   *
   * ```ts
   * // In the browser: same-origin only, no credentials of any kind
   * const response = await fetch('/form-submission', {
   *   body: JSON.stringify(postBody),
   *   headers: { 'Content-Type': 'application/json' },
   *   method: 'POST'
   * });
   *
   * // In that route, on the server: the api key stays here
   * await post('form-submissions', getPayloadRequestOptions(...));
   * ```
   *
   * @param data - The form submission data.
   * @returns The form submission response.
   */
  submitForm: (data: FormSubmitData) => Promise<FormSubmitResponse>;

  /**
   * Provide a function to handle tour signups server-side, the same way as
   * `submitForm` — the tenant api key must never reach the browser.
   *
   * The response carries the status the server decided: a customer signing up
   * for a full tour is put on the waiting list, and the form has to say so.
   *
   * Same shape as `submitForm`: post to your own origin, and let that route
   * reach the cms.
   *
   * ```ts
   * const response = await fetch('/tour-signup', {
   *   body: JSON.stringify(data),
   *   headers: { 'Content-Type': 'application/json' },
   *   method: 'POST'
   * });
   * ```
   *
   * @param data - The customer's signup details.
   * @returns The signup response.
   */
  submitTourSignup: (data: TourSignupData) => Promise<TourSignupResponse>;

  /**
   * Provide what the tour signup form must disclose about personal data —
   * the workspace's privacy and terms pages, and how long details are kept.
   *
   * Resolve it from site settings with `resolveSignupPolicy`. Omit only when
   * the app renders no tour signup form at all.
   */
  signupPolicy?: SignupPolicy | null;

  /**
   * The public key the human-check widget is drawn with.
   *
   * Omit it and a form still carries the hidden field and the time it took to
   * fill in, which the host's route checks either way. The secret that
   * verifies a token never leaves the server, so it is not here.
   */
  humanCheck?: { siteKey: string } | null;

  /**
   * Provide the current color scheme state.
   *
   * Use your color scheme state value to make this value reflect changes automatically.
   * This can be 'light', 'dark', or 'system' for auto-detection.
   */
  colorScheme: 'light' | 'dark' | 'system' | undefined;

  /**
   * The site's color scheme *policy*, as opposed to `colorScheme` above which
   * is the current state.
   *
   * `null` means the visitor may switch and the switch is rendered. A value
   * locks the site to that scheme, and no switch is shown.
   */
  lockedColorScheme: 'light' | 'dark' | null;

  /**
   * How the header and its controls are drawn.
   *
   * Read from context rather than passed down, so the navigation and both
   * toggles cannot disagree about it.
   */
  chrome: 'flat' | 'outlined';

  /**
   * Themes the site may render, each as the value its `data-theme` attribute
   * takes plus the name to show for it.
   *
   * A single entry means no theme selector is rendered. `value` is a plain
   * string, not a union: themes authored at runtime are not known at build
   * time, and the host supplies their labels the same way.
   */
  themes: Array<{ value: string; label: string }>;

  /**
   * The active theme — matches `data-theme` on the document element.
   */
  theme: string;

  /**
   * Provide a function to switch the active theme.
   *
   * The host is responsible for persisting the choice and re-rendering with it,
   * so the server and the document agree on first paint.
   *
   * @param theme - One of `themes`
   */
  setTheme: (theme: string) => void;

  /**
   * The resolved color scheme (what is actually displayed).
   * When the color scheme is 'system', this will be 'light' or 'dark' based on
   * system preference.
   */
  resolvedColorScheme?: 'light' | 'dark';

  /**
   * Provide the current locale/language code.
   *
   * This is used by components that need to display localized text.
   * Common values: 'en', 'sv', etc.
   *
   * Example implementations:
   * - From URL params, user preferences, or tenant configuration
   *
   * @example 'en', 'sv'
   */
  locale: string;
};

type PayloadProviderProps = {
  children: ReactNode;
  value: PayloadValue;
};

// Create a context
const Context = createContext<PayloadValue | null>(null);

/**
 * This provider is used to pass values to the Payload components.
 *
 * This component also setup shadcn sonner component for notifications.
 * @see https://ui.shadcn.com/docs/components/sonner
 */
export function PayloadProvider({ children, value }: PayloadProviderProps) {
  // The toaster is a singleton, so only the outermost provider brings one.
  // Nesting to override part of the value is legitimate; two toast regions
  // are not — they land as duplicate landmarks with the same name.
  const nested = use(Context) !== null;

  return (
    <Context.Provider value={value}>
      {children}
      {!nested && <Toaster theme={value.resolvedColorScheme ?? 'system'} />}
    </Context.Provider>
  );
}

/**
 * Hook to get access to the Payload context value,
 * which is set in the app root using the `PayloadProvider`.
 *
 * @throws If not context value has been set with `PayloadProvider`.
 */
export const usePayload = () => {
  const context = use(Context);
  if (!context) {
    throw new Error('usePayload must be used within a PayloadProvider');
  }
  return context;
};
