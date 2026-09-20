import { t } from '@codeware/shared/util/i18n';
import { resolveReturnPath } from '@codeware/shared/util/site-gate';
import type { Metadata } from 'next';

import { payloadRuntime } from '../../../security/payload-runtime';
import {
  MEMBER_LOGIN_SUBMIT_PATH,
  type MemberLoginError
} from '../../../utils/member-login';

/** A sign-in form has nothing to offer a search engine */
export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

type Props = {
  // A repeated query key arrives as an array, which `resolveReturnPath` takes
  searchParams: Promise<{
    error?: string | Array<string>;
    from?: string | Array<string>;
  }>;
};

/**
 * Asks a visitor to sign in so members-only content becomes readable.
 *
 * Lives in `(site)` rather than beside the platform's own pages, so it renders
 * in the tenant's theme and reads as part of their site. A static segment beats
 * the `[...slug]` catch-all, so a tenant page slugged `login` would be
 * shadowed by this route — worth knowing before naming one that.
 */
export default async function MemberLoginPage({ searchParams }: Props) {
  const { error, from } = await searchParams;
  const { tenantConfig } = await payloadRuntime();

  const locale = tenantConfig?.locale ?? 'en';
  const returnTo = resolveReturnPath(
    Array.isArray(from) ? (from[0] ?? '/') : (from ?? '/')
  );

  const reason = (Array.isArray(error) ? error[0] : error) as
    | MemberLoginError
    | undefined;

  // Coarse on purpose: a wrong password and an unknown address read the same,
  // so the form cannot be used to discover who belongs to this workspace
  const message =
    reason === 'throttled'
      ? t(locale, 'memberLogin.tooManyAttempts')
      : reason
        ? t(locale, 'memberLogin.failed')
        : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          {t(locale, 'memberLogin.heading')}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t(locale, 'memberLogin.intro')}
        </p>
      </div>

      <form
        action={MEMBER_LOGIN_SUBMIT_PATH}
        method="post"
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="from" value={returnTo} />

        <label className="flex flex-col gap-1 text-sm">
          {t(locale, 'memberLogin.email')}
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {t(locale, 'memberLogin.password')}
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            className="border-input bg-background rounded-md border px-3 py-2"
          />
        </label>

        <button
          type="submit"
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 font-medium"
        >
          {t(locale, 'memberLogin.submit')}
        </button>

        {/* Below the action, where the eye already is after pressing it */}
        {message ? (
          <p role="alert" className="text-destructive text-sm">
            {message}
          </p>
        ) : null}
      </form>
    </main>
  );
}
