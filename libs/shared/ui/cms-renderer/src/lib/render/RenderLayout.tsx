'use client';

import type {
  FooterData,
  NavigationItem
} from '@codeware/shared/util/payload-api';
import { cn } from '@codeware/shared/util/ui';
import { House } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Container } from '../layout/Container';
import { DesktopNavigation } from '../navigation/DesktopNavigation';
import { Footer } from '../navigation/Footer';
import { MobileNavigation } from '../navigation/MobileNavigation';
import { usePayload } from '../providers/PayloadProvider';
import { ColorSchemeSwitch } from '../theme/ColorSchemeSwitch';
import { ThemeSelect } from '../theme/ThemeSelect';
import { handleAsRoute } from '../utils/internal-link';
import { TenantIcon } from '../utils/TenantIcon';

type RenderLayoutProps = {
  children: React.ReactNode;
  /**
   * Footer content, or `null` when the tenant has no footer.
   * The app is responsible for fetching this data.
   */
  footer: FooterData | null;
  /**
   * Navigation items for the header.
   * The app is responsible for fetching this data.
   */
  navigationTree: NavigationItem[];
};

/**
 * Framework-agnostic layout component for CMS sites.
 *
 * Renders the main layout structure with:
 * - Header with logo, navigation (desktop/mobile), and color scheme switch
 * - Main content area
 * - Footer as configured in the CMS site settings
 *
 * **Usage:**
 * The app is responsible for:
 * - Fetching navigation and footer data
 * - Providing PayloadProvider context with framework-specific implementations
 * - Wrapping with theme provider if needed (e.g., next-themes for Next.js)
 *
 * @example
 * ```tsx
 * // In Next.js app
 * const navigationTree = await getNavigationTree(payload);
 * const footer = await getFooter(payload, navigationTree);
 *
 * return (
 *   <Providers>
 *     <RenderLayout footer={footer} navigationTree={navigationTree}>
 *       {children}
 *     </RenderLayout>
 *   </Providers>
 * );
 * ```
 */
export function RenderLayout({
  children,
  footer,
  navigationTree
}: RenderLayoutProps) {
  const { navigate, iconConfig } = usePayload();

  const headerRow = useRef<HTMLDivElement>(null);
  const brand = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const desktopNav = useRef<HTMLElement>(null);

  /**
   * Whether the navigation fits beside the brand and the controls.
   *
   * A media query answers a different question — it knows the viewport width,
   * not whether *these* labels fit — so six long ones overlap the controls at
   * 900px while three short ones would have been fine at 700px.
   *
   * Everything compared here is a *content* width, and none of it changes when
   * the answer changes: the nav leaves the flow rather than being unmounted, so
   * it still reports its natural width, and the row is sized by its container.
   * Measuring the nav's column instead is what made an earlier attempt oscillate.
   */
  const [fits, setFits] = useState(true);

  useEffect(() => {
    const row = headerRow.current;
    const logo = brand.current;
    const actions = controls.current;
    const nav = desktopNav.current;

    if (!row || !logo || !actions || !nav) {
      return;
    }

    const measure = () => {
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
      const needed =
        logo.scrollWidth + nav.scrollWidth + actions.scrollWidth + gap * 2;

      setFits(needed <= row.clientWidth);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);

    return () => observer.disconnect();
  }, [navigationTree]);

  return (
    <div className="flex w-full">
      {/* Create a center aligned section with background space on each side */}
      <div className="fixed inset-0 flex justify-center sm:px-8">
        <div className="flex w-full max-w-7xl lg:px-8">
          {/* Content section */}
          <div className="bg-core-background-content ring-core-content-border w-full ring-1" />
        </div>
      </div>
      {/* Display header, main and footer inside the content section.
          Full viewport height keeps the footer at the bottom on short pages,
          where its surface would otherwise end mid-panel */}
      <div className="relative flex min-h-screen w-full flex-col">
        <header className="pointer-events-none relative z-50 flex flex-none flex-col">
          <div className="top-0 z-10 h-16 pt-6">
            <Container className="w-full">
              <div ref={headerRow} className="relative flex gap-4">
                <div className="flex flex-1">
                  <div
                    ref={brand}
                    className="flex h-10 w-10 items-center backdrop-blur"
                  >
                    {/* An anchor, not a button: a real href keeps
                        middle-click, right-click → copy link, and crawlers
                        working. Matches every other internal link here. */}
                    <a
                      href="/"
                      onClick={(e) => {
                        if (!handleAsRoute(e)) return;
                        navigate('/');
                      }}
                      className="pointer-events-auto"
                      aria-label="Home"
                    >
                      {iconConfig ? (
                        <TenantIcon config={iconConfig} size={40} />
                      ) : (
                        <House size={40} />
                      )}
                    </a>
                  </div>
                </div>
                {/* Centred only while the pill is what is shown — the
                    collapsed button belongs beside the controls, where it sits
                    at every other width */}
                <div
                  className={cn(
                    'flex flex-1 items-center justify-end',
                    fits && 'md:justify-center'
                  )}
                >
                  <MobileNavigation
                    navigationTree={navigationTree}
                    className={cn('pointer-events-auto', fits && 'md:hidden')}
                  />
                  {/* Taken out of the flow rather than unmounted when it does
                      not fit, so it keeps reporting the width this decision
                      depends on */}
                  <DesktopNavigation
                    ref={desktopNav}
                    navigationTree={navigationTree}
                    className={cn(
                      'pointer-events-auto hidden md:block',
                      !fits && 'md:invisible md:absolute'
                    )}
                  />
                </div>
                {/* Claims a third only while the pill needs the middle one
                    centred. Once the nav has collapsed to a button there is
                    nothing to centre, and the third it was reserving is what
                    left that button stranded away from these icons */}
                <div
                  className={cn(
                    'flex items-center justify-end',
                    fits && 'md:flex-1'
                  )}
                >
                  {/* Both controls are conditional and both may be absent —
                      `gap` rather than margins so the row simply collapses */}
                  <div
                    ref={controls}
                    className="pointer-events-auto flex items-center gap-2"
                  >
                    <ThemeSelect />
                    <ColorSchemeSwitch />
                  </div>
                </div>
              </div>
            </Container>
          </div>
        </header>

        <main className="flex-auto">{children}</main>
        <Footer footer={footer} />
      </div>
    </div>
  );
}
