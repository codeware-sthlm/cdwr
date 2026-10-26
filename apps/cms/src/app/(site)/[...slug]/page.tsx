import { getPage, getPageData } from '@codeware/app-cms/data-access';
import { sitePath } from '@codeware/app-cms/util/misc';
import type { Metadata } from 'next';
import { draftMode } from 'next/headers';
import { notFound } from 'next/navigation';

import { payloadRuntime } from '../../../security/payload-runtime';
import { documentMetadata } from '../../../utils/page-metadata';

import { PagePreview } from './page-preview.client';

interface Props {
  params: Promise<{
    slug: string[];
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { isEnabled: draft } = await draftMode();
  const runtime = await payloadRuntime({ asVisitor: true });
  const page = await getPage(runtime, slug.join('/'), { draft, depth: 1 });

  return page
    ? documentMetadata(page, {
        siteName: runtime.tenantConfig?.appName,
        origin: runtime.payload.config.serverURL,
        path: sitePath('pages', page, runtime.tenantConfig?.landingPage.id),
        locale: runtime.tenantConfig?.locale
      })
    : {};
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const slugString = slug.join('/');

  const { isEnabled: draft } = await draftMode();
  const runtime = await payloadRuntime({ asVisitor: true });
  const data = await getPageData(runtime, slugString, { draft });

  if (!data) {
    notFound();
  }

  return (
    <PagePreview page={data.page} blocksData={data.blocksData} live={draft} />
  );
}
