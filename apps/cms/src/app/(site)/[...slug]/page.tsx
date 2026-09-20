import { getPageData } from '@codeware/app-cms/data-access';
import { draftMode } from 'next/headers';
import { notFound } from 'next/navigation';

import { payloadRuntime } from '../../../security/payload-runtime';

import { PagePreview } from './page-preview.client';

interface Props {
  params: Promise<{
    slug: string[];
  }>;
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

  return <PagePreview page={data.page} blocksData={data.blocksData} />;
}
