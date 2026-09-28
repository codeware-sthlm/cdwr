import { getPage, getPageData } from '@codeware/app-cms/data-access';
import type { Metadata } from 'next';
import { draftMode } from 'next/headers';
import { notFound } from 'next/navigation';

import { payloadRuntime } from '../../security/payload-runtime';
import { documentMetadata } from '../../utils/page-metadata';

import { LandingPagePreview } from './landing-page-preview.client';

/** The front page carries the site's name, unless an SEO title says otherwise */
export async function generateMetadata(): Promise<Metadata> {
  const { isEnabled: draft } = await draftMode();
  const runtime = await payloadRuntime({ asVisitor: true });
  const page = await getPage(
    runtime,
    runtime.tenantConfig?.landingPage.id ?? 0,
    {
      draft,
      depth: 1
    }
  );

  return page
    ? documentMetadata(page, {
        landing: true,
        siteName: runtime.tenantConfig?.appName
      })
    : {};
}

export default async function SiteIndexPage() {
  const { isEnabled: draft } = await draftMode();
  const runtime = await payloadRuntime({ asVisitor: true });

  // getPageData, not getPage — listing blocks (posts, tours) query a
  // collection dynamically and need their data resolved alongside the page
  const data = await getPageData(
    runtime,
    runtime.tenantConfig?.landingPage.id ?? 0,
    { draft }
  );

  if (!data) {
    notFound();
  }

  return (
    <LandingPagePreview landingPage={data.page} blocksData={data.blocksData} />
  );
}
