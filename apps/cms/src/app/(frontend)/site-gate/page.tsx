import { type SupportedLocale, t } from '@codeware/shared/util/i18n';
import { resolveReturnPath } from '@codeware/shared/util/site-gate';
import { Lock, Unlock } from 'lucide-react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Image from 'next/image';

import { SITE_GATE_SUBMIT_PATH } from '../../../utils/site-gate';

/** Belt and braces beside the proxy's own header and the robots file */
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
 * Asks for the password that opens a site which is not public yet.
 *
 * Lives beside the maintenance page rather than in `(site)`: a gated site
 * should not have to reach its database to say it is closed, and the answer
 * is the platform's, not the tenant's.
 *
 * The visitor's own language is read from the request, since the tenant's
 * configured locale lives behind the very data this page does not fetch.
 */
export default async function SiteGatePage({ searchParams }: Props) {
  const { error, from } = await searchParams;
  const accepted = (await headers()).get('accept-language') ?? '';
  const locale: SupportedLocale = accepted.toLowerCase().startsWith('sv')
    ? 'sv'
    : 'en';

  const reason = Array.isArray(error) ? error[0] : error;
  const message =
    reason === 'throttled'
      ? t(locale, 'siteGate.tooManyAttempts')
      : reason
        ? t(locale, 'siteGate.wrongPassword')
        : null;

  return (
    <div className="relative flex w-full flex-col items-center text-center">
      {/* The platform's own mark, on a layer of its own that spans the window.
          Clipped at the screen edge rather than at the page's text column, so
          the cloud can be wider than the content it sits behind. Sized on the
          file's own 2709x1908 ratio, since a ratio Next has to correct is a
          warning. */}
      <div
        className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden"
        aria-hidden
      >
        <Image
          src="/cdwr-cloud.png"
          alt=""
          width={900}
          height={634}
          // The largest thing on the page, so it is the LCP element whether or
          // not it is decorative — lazy loading it only delays the paint
          priority
          className="max-w-none mask-[radial-gradient(ellipse_at_center,black_30%,transparent_75%)] opacity-[0.06] dark:invert"
        />
      </div>

      <Lock className="relative z-10 size-8 opacity-40" aria-hidden />
      <h1 className="relative z-10 mt-6 text-2xl font-bold">
        {t(locale, 'siteGate.heading')}
      </h1>
      <p className="relative z-10 mt-4 opacity-70">
        {t(locale, 'siteGate.intro')}
      </p>

      <form
        action={SITE_GATE_SUBMIT_PATH}
        method="post"
        className="relative z-10 mt-8 w-full max-w-md"
      >
        <input type="hidden" name="from" value={resolveReturnPath(from)} />
        <label htmlFor="site-gate-password" className="sr-only">
          {t(locale, 'siteGate.password')}
        </label>
        {/* The button sits inside the field, so one centred control carries
            both and the placeholder stays on the page's own axis */}
        <input
          id="site-gate-password"
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          required
          placeholder={t(locale, 'siteGate.password')}
          className="border-cdwr-space-cadet/20 dark:border-cdwr-light-gray/20 focus:border-cdwr-space-cadet dark:focus:border-cdwr-light-gray dark:bg-cdwr-darker-black/70 w-full rounded-md border bg-white/80 px-12 py-2 text-center outline-none"
        />
        <button
          type="submit"
          aria-label={t(locale, 'siteGate.submit')}
          title={t(locale, 'siteGate.submit')}
          className="text-cdwr-space-cadet dark:text-cdwr-light-gray absolute top-1/2 right-2 flex -translate-y-1/2 items-center justify-center rounded-md p-1.5 opacity-60 transition-opacity hover:opacity-100"
        >
          <Unlock className="size-5" aria-hidden />
        </button>
      </form>

      {message && (
        <p role="alert" className="relative z-10 mt-4 text-sm font-medium">
          {message}
        </p>
      )}
    </div>
  );
}
