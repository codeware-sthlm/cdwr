'use client';

import { t } from '@codeware/shared/util/i18n';
import type { FooterData } from '@codeware/shared/util/payload-api';
import { formatReleaseName } from '@codeware/shared/util/pure';
import { cn } from '@codeware/shared/util/ui';

import { ContainerInner, ContainerOuter } from '../layout/Container';
import { usePayload } from '../providers/PayloadProvider';
import { SocialLinks } from '../social/SocialLinks';
import { isActivePath } from '../utils/active-path';
import { handleAsRoute } from '../utils/internal-link';
import { TenantIcon } from '../utils/TenantIcon';

import { MemberSession, type MemberSessionData } from './MemberSession';

function NavLink({
  href,
  newTab,
  children
}: {
  href: string;
  newTab: boolean;
  children: React.ReactNode;
}) {
  const { getCurrentPath, navigate } = usePayload();

  // The same rule the header navigation uses, so a page the visitor is already
  // on reads the same whichever navigation they look at
  const isActive = isActivePath(getCurrentPath(), href);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!handleAsRoute(e)) return;
    navigate(href, newTab);
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      aria-current={isActive ? 'page' : undefined}
      // Underline gives the hover a second signal beyond the colour shift
      className={cn(
        'transition hover:underline hover:underline-offset-4',
        isActive
          ? 'text-core-nav-link-active'
          : 'hover:text-core-nav-link-hover'
      )}
    >
      {children}
    </a>
  );
}

/** Replace every `{year}` token with the current year. */
const withYear = (copyright: string): string =>
  copyright.replaceAll('{year}', String(new Date().getFullYear()));

/** Links as a wrapping row, used by the compact and standard variants. */
function LinkRow({ links }: { links: FooterData['links'] }) {
  if (!links.length) {
    return null;
  }

  return (
    <div className="text-core-nav-link flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm font-medium">
      {links.map(({ key, label, newTab, url }) => (
        <NavLink key={key} href={url} newTab={newTab}>
          {label}
        </NavLink>
      ))}
    </div>
  );
}

/** Privacy and terms, beside the copyright on every variant. */
function LegalLinks({ links }: { links: FooterData['legalLinks'] }) {
  if (!links.length) {
    return null;
  }

  return (
    <span className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {links.map(({ key, label, newTab, url }) => (
        <NavLink key={key} href={url} newTab={newTab}>
          {label}
        </NavLink>
      ))}
    </span>
  );
}

/**
 * Copyright, legal links and release line.
 *
 * Secondary to the content above it. Kept at full muted color — dimming it
 * further fails the contrast check at this size.
 */
function SecondaryLine({
  className,
  copyright,
  layout = 'stack',
  legalLinks,
  showVersion
}: {
  className?: string;
  copyright: string | null;
  legalLinks: FooterData['legalLinks'];
  /** `row` splits the two texts across the full width from `sm` and up. */
  layout?: 'row' | 'stack';
  showVersion: boolean;
}) {
  const { appInfo } = usePayload();

  if (!copyright && !showVersion && !legalLinks.length) {
    return null;
  }

  const isRow = layout === 'row';

  return (
    <div
      className={cn(
        'text-muted-foreground flex flex-col items-center gap-1 text-xs',
        isRow && 'justify-between sm:flex-row',
        className
      )}
    >
      {(copyright || legalLinks.length > 0) && (
        <div
          className={cn(
            'flex flex-col items-center gap-1',
            isRow && 'sm:flex-row sm:gap-4'
          )}
        >
          {copyright && <p>{withYear(copyright)}</p>}
          <LegalLinks links={legalLinks} />
        </div>
      )}
      {/* Stays right when the copyright line is turned off */}
      {showVersion && (
        <p className={cn(isRow && 'sm:ml-auto')}>
          {formatReleaseName(appInfo)}
        </p>
      )}
    </div>
  );
}

/**
 * Everything on one centered stack — for sites with few pages, where a full
 * footer would outweigh the page above it.
 */
function CompactFooter({
  footer,
  session
}: {
  footer: FooterData;
  session?: MemberSessionData;
}) {
  const { contact, copyright, legalLinks, links, showVersion, tagline } =
    footer;

  return (
    <footer className="bg-core-background-body border-core-content-border mt-12 flex-none border-t">
      <ContainerOuter>
        <div className="py-10">
          <ContainerInner>
            <div className="flex flex-col items-center gap-4 text-center">
              {tagline && (
                <p className="text-muted-foreground max-w-xl text-sm whitespace-pre-line">
                  {tagline}
                </p>
              )}
              <LinkRow links={links} />
              <SocialLinks links={contact} />
              {session && <MemberSession session={session} />}
              <SecondaryLine
                copyright={copyright}
                legalLinks={legalLinks}
                showVersion={showVersion}
              />
            </div>
          </ContainerInner>
        </div>
      </ContainerOuter>
    </footer>
  );
}

/** Links and contacts share a row, with the secondary line beneath. */
function StandardFooter({
  footer,
  session
}: {
  footer: FooterData;
  session?: MemberSessionData;
}) {
  const { contact, copyright, legalLinks, links, showVersion, tagline } =
    footer;

  return (
    <footer className="bg-core-background-body border-core-content-border mt-16 flex-none border-t">
      <ContainerOuter>
        <div className="pt-10 pb-16">
          <ContainerInner>
            {/* Everything stacks and centers on small screens */}
            <div className="flex flex-col gap-5 text-center sm:text-left">
              {tagline && (
                <p className="text-muted-foreground mx-auto max-w-xl text-sm whitespace-pre-line sm:mx-0">
                  {tagline}
                </p>
              )}
              {(links.length > 0 || contact.length > 0) && (
                <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
                  <LinkRow links={links} />
                  <SocialLinks links={contact} />
                </div>
              )}
              {/* Separates navigation from metadata, as in the expanded variant.
                  The member slot belongs below the line, not beside the page
                  links — it is account state, and above the line it reads as
                  one more place to go */}
              <div className="flex flex-col gap-3 border-t pt-5">
                {session && (
                  <MemberSession
                    className="justify-center sm:justify-start"
                    session={session}
                  />
                )}
                <SecondaryLine
                  copyright={copyright}
                  layout="row"
                  legalLinks={legalLinks}
                  showVersion={showVersion}
                />
              </div>
            </div>
          </ContainerInner>
        </div>
      </ContainerOuter>
    </footer>
  );
}

/**
 * Brand mark and tagline beside the links, with the secondary line on its own
 * bar — for content-heavy sites that can carry the extra height.
 */
function ExpandedFooter({
  footer,
  session
}: {
  footer: FooterData;
  session?: MemberSessionData;
}) {
  const { iconConfig, locale } = usePayload();
  const {
    appName,
    contact,
    copyright,
    legalLinks,
    links,
    showVersion,
    tagline
  } = footer;

  return (
    <footer className="bg-core-background-body border-core-content-border mt-16 flex-none border-t">
      <ContainerOuter>
        <div className="py-12">
          <ContainerInner>
            <div className="grid gap-10 md:grid-cols-2">
              {/* Brand column */}
              <div className="flex flex-col items-center gap-4 text-center md:items-start md:text-left">
                <div className="flex items-center gap-3">
                  {iconConfig && <TenantIcon config={iconConfig} size={32} />}
                  <span className="text-core-headline font-semibold">
                    {appName}
                  </span>
                </div>
                {tagline && (
                  <p className="text-muted-foreground max-w-sm text-sm whitespace-pre-line">
                    {tagline}
                  </p>
                )}
                <SocialLinks links={contact} />
                {session && <MemberSession session={session} />}
              </div>

              {/* Links flow down each column beside the brand. Multi-column
                  balances them by height — a grid stretches its rows to the
                  brand column instead, leaving holes in the last row.
                  A second column only earns its keep once the list is long
                  enough to fill it, otherwise the few links drift apart */}
              {links.length > 0 && (
                <nav
                  aria-label={t(locale, 'navigation.footer')}
                  className={cn(
                    'text-core-nav-link gap-x-8 text-center text-sm font-medium md:text-left',
                    links.length >= 4 ? 'columns-1 sm:columns-2' : 'columns-1'
                  )}
                >
                  {links.map(({ key, label, newTab, url }) => (
                    <div key={key} className="mb-3 break-inside-avoid">
                      <NavLink href={url} newTab={newTab}>
                        {label}
                      </NavLink>
                    </div>
                  ))}
                </nav>
              )}
            </div>

            <SecondaryLine
              className="mt-10 border-t pt-6"
              copyright={copyright}
              layout="row"
              legalLinks={legalLinks}
              showVersion={showVersion}
            />
          </ContainerInner>
        </div>
      </ContainerOuter>
    </footer>
  );
}

/**
 * The member slot on its own, for a tenant that has no footer configured.
 *
 * Nothing but the session line, so it reads as a thin bar rather than an
 * empty footer the tenant did not ask for.
 */
function MemberOnlyFooter({ session }: { session: MemberSessionData }) {
  return (
    <footer className="bg-core-background-body border-core-content-border mt-12 flex-none border-t">
      <ContainerOuter>
        <div className="py-6">
          <ContainerInner>
            <MemberSession className="justify-center" session={session} />
          </ContainerInner>
        </div>
      </ContainerOuter>
    </footer>
  );
}

/**
 * Site footer, configured per tenant in the CMS site settings.
 *
 * Renders nothing when the footer is disabled (`footer` is `null`) or when
 * every part of it is turned off — unless a member is signed in, who needs
 * somewhere to sign out from either way.
 */
export function Footer({
  footer,
  session
}: {
  footer: FooterData | null;
  /**
   * Sign in / sign out slot. Omitted on a site with no members-only content,
   * and by `apps/web`, which does not own those routes.
   */
  session?: MemberSessionData;
}) {
  // A disabled footer still owes a signed-in member the way out. Sign-out is
  // not the tenant's to turn off — the alternative is a session the visitor
  // cannot end from the site that started it
  if (!footer) {
    return session ? <MemberOnlyFooter session={session} /> : null;
  }

  const { contact, copyright, legalLinks, links, showVersion, tagline } =
    footer;

  // Everything can be turned off, which leaves nothing but a border to render.
  // A member slot is reason enough to keep the footer: without it a signed-in
  // visitor would have nowhere to sign out from
  if (
    !session &&
    !tagline &&
    !links.length &&
    !legalLinks.length &&
    !contact.length &&
    !copyright &&
    !showVersion
  ) {
    return null;
  }

  switch (footer.variant) {
    case 'compact':
      return <CompactFooter footer={footer} session={session} />;
    case 'expanded':
      return <ExpandedFooter footer={footer} session={session} />;
    default:
      return <StandardFooter footer={footer} session={session} />;
  }
}
