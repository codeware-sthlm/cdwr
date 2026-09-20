'use client';

import { t } from '@codeware/shared/util/i18n';
import { cn } from '@codeware/shared/util/ui';
import { User } from 'lucide-react';

import { usePayload } from '../providers/PayloadProvider';

export type MemberSessionData = {
  /** Name of the signed-in member, or `null` when nobody is signed in */
  name: string | null;

  /** Page that asks for credentials */
  loginPath: string;

  /** Route the sign-out form posts to */
  logoutPath: string;
};

/**
 * Sign in to, or out of, the members-only parts of a site.
 *
 * One slot that swaps rather than two controls, so its position is learnable
 * and it doubles as the only indication that anyone is signed in at all —
 * navigation hides what a visitor may not read, so without this the member
 * area leaves no trace.
 *
 * Paths are props because this renders in both apps and only the CMS owns
 * those routes.
 *
 * Both states carry the current path, so signing in or out returns the visitor
 * where they were rather than dropping them on the home page. The receiving
 * routes re-check it — a path arriving from the browser is never trusted as a
 * redirect target.
 */
export function MemberSession({
  className,
  session
}: {
  className?: string;
  session: MemberSessionData;
}) {
  const { getCurrentPath, locale } = usePayload();
  const from = getCurrentPath();

  // Muted and small on purpose: this is account state, not a page. Styled like
  // the navigation links it sits near, it reads as one more place to go.
  const linkStyle =
    'text-muted-foreground hover:text-core-nav-link-hover inline-flex items-center gap-1.5 transition hover:underline hover:underline-offset-4';

  if (!session.name) {
    return (
      <a
        href={`${session.loginPath}?from=${encodeURIComponent(from)}`}
        className={cn(linkStyle, 'text-xs', className)}
      >
        {t(locale, 'memberLogin.heading')}
      </a>
    );
  }

  return (
    <form
      action={session.logoutPath}
      method="post"
      className={cn(
        'text-muted-foreground flex items-center gap-2 text-xs',
        className
      )}
    >
      {/* No destination is sent: signing out can only take access away, so the
          current page may not survive it. The route always lands on home */}
      {/* The person marks the slot as account state. The two actions get no
          icon: `LogIn` and `LogOut` are the same arrow-through-a-bracket at
          this size, so they distinguish nothing and only add noise */}
      <User aria-hidden="true" className="size-3.5" />
      <span>{session.name}</span>
      <span aria-hidden="true">·</span>
      <button type="submit" className={linkStyle}>
        {t(locale, 'memberLogin.signOut')}
      </button>
    </form>
  );
}
