import { getPageData } from '@codeware/app-cms/data-access';
import { draftMode } from 'next/headers';
import { notFound } from 'next/navigation';

import { payloadRuntime } from '../../security/payload-runtime';

import { LandingPagePreview } from './landing-page-preview.client';

// TODO: metadata

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
