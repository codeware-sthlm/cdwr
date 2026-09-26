import { t } from '@codeware/shared/util/i18n';
import type { Page } from '@codeware/shared/util/payload-types';
import type { BlocksData } from '@codeware/shared/util/payload-utils';

import { ErrorContainer } from '../error/ErrorContainer';
import { ContainerInner, ContainerOuter } from '../layout/Container';
import { RenderBlocks } from '../RenderBlocks';

type RenderLandingPageProps = {
  /**
   * Landing page data from site settings.
   * The app is responsible for fetching this data.
   */
  landingPage?: Page | null;

  /**
   * The current locale used for translating UI strings.
   * Defaults to 'en' if not provided.
   */
  locale?: string;

  /**
   * Pre-fetched data for blocks that require server-side data.
   * Keyed by block id.
   *
   * Without it, listing blocks on the landing page (posts, tours) render
   * with no data.
   */
  blocksData?: BlocksData;
};

/**
 * Framework-agnostic landing page renderer.
 *
 * Renders the landing page with:
 * - Optional header
 * - Page blocks via RenderBlocks
 * - Error message if no landing page is configured
 *
 * **Usage:**
 * The app is responsible for:
 * - Fetching landing page data from site settings
 * - Providing PayloadProvider context
 *
 * @example
 * ```tsx
 * // In Next.js app
 * const settings = await getSiteSettings(payload);
 * return <RenderLandingPage landingPage={settings?.landingPage} />;
 * ```
 */
export function RenderLandingPage({
  landingPage,
  locale,
  blocksData
}: RenderLandingPageProps) {
  return (
    // The outer layer only: each block brings the inner one, so a band can
    // sit between the two and span the sheet
    <ContainerOuter className="mt-16 sm:mt-32">
      {landingPage?.header && (
        <ContainerInner>
          <header className="max-w-2xl">
            <h1 className="text-core-headline text-4xl font-bold tracking-tight sm:text-5xl">
              {landingPage.header}
            </h1>
          </header>
        </ContainerInner>
      )}
      <article className="mt-16">
        {landingPage?.layout ? (
          <RenderBlocks
            framed
            blocks={landingPage.layout}
            blocksData={blocksData}
          />
        ) : (
          <ContainerInner>
            <ErrorContainer
              title={t(locale ?? 'en', 'error.landingPageNotFound')}
              locale={locale}
              severity="info"
              withoutContainer={true}
            >
              {t(locale ?? 'en', 'error.landingPageNotFoundDescription')}
            </ErrorContainer>
          </ContainerInner>
        )}
      </article>
    </ContainerOuter>
  );
}
