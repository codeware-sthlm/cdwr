'use client';

import type { FooterData } from '@codeware/shared/util/payload-api';
import { formatReleaseName } from '@codeware/shared/util/pure';
import { cn } from '@codeware/shared/util/ui';

import { ContainerInner, ContainerOuter } from '../layout/Container';
import { usePayload } from '../providers/PayloadProvider';
import { SocialLinks } from '../social/SocialLinks';
import { isActivePath } from '../utils/active-path';
import { handleAsRoute } from '../utils/internal-link';
import { TenantIcon } from '../utils/TenantIcon';

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

/**
 * Copyright and release line.
 *
 * Secondary to the content above it. Kept at full muted color — dimming it
 * further fails the contrast check at this size.
 */
function SecondaryLine({
  className,
  copyright,
  layout = 'stack',
  showVersion
}: {
  className?: string;
  copyright: string | null;
  /** `row` splits the two texts across the full width from `sm` and up. */
  layout?: 'row' | 'stack';
  showVersion: boolean;
}) {
  const { appInfo } = usePayload();

  if (!copyright && !showVersion) {
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
      {copyright && <p>{withYear(copyright)}</p>}
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
function CompactFooter({ footer }: { footer: FooterData }) {
  const { contact, copyright, links, showVersion, tagline } = footer;

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
              <SecondaryLine copyright={copyright} showVersion={showVersion} />
            </div>
          </ContainerInner>
        </div>
      </ContainerOuter>
    </footer>
  );
}

/** Links and contacts share a row, with the secondary line beneath. */
function StandardFooter({ footer }: { footer: FooterData }) {
  const { contact, copyright, links, showVersion, tagline } = footer;

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
              {/* Separates navigation from metadata, as in the expanded variant */}
              <SecondaryLine
                className="border-t pt-5"
                copyright={copyright}
                layout="row"
                showVersion={showVersion}
              />
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
function ExpandedFooter({ footer }: { footer: FooterData }) {
  const { iconConfig } = usePayload();
  const { appName, contact, copyright, links, showVersion, tagline } = footer;

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
              </div>

              {/* Links flow down each column beside the brand. Multi-column
                  balances them by height — a grid stretches its rows to the
                  brand column instead, leaving holes in the last row.
                  A second column only earns its keep once the list is long
                  enough to fill it, otherwise the few links drift apart */}
              {links.length > 0 && (
                <nav
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
              showVersion={showVersion}
            />
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
 * every part of it is turned off.
 */
export function Footer({ footer }: { footer: FooterData | null }) {
  if (!footer) {
    return null;
  }

  const { contact, copyright, links, showVersion, tagline } = footer;

  // Everything can be turned off, which leaves nothing but a border to render
  if (
    !tagline &&
    !links.length &&
    !contact.length &&
    !copyright &&
    !showVersion
  ) {
    return null;
  }

  switch (footer.variant) {
    case 'compact':
      return <CompactFooter footer={footer} />;
    case 'expanded':
      return <ExpandedFooter footer={footer} />;
    default:
      return <StandardFooter footer={footer} />;
  }
}
