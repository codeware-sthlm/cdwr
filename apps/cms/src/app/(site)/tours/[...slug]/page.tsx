import { getTour } from '@codeware/app-cms/data-access';
import type { Metadata } from 'next';
import { draftMode } from 'next/headers';
import { notFound } from 'next/navigation';

import { payloadRuntime } from '../../../../security/payload-runtime';
import { documentMetadata } from '../../../../utils/page-metadata';

import { TourPreview } from './tour-preview.client';

interface Props {
  params: Promise<{
    slug: string[];
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { isEnabled: draft } = await draftMode();
  const runtime = await payloadRuntime({ asVisitor: true });
  const tour = await getTour(runtime, slug.join('/'), { draft });

  return tour
    ? documentMetadata(
        { name: tour.title, summary: tour.summary },
        { siteName: runtime.tenantConfig?.appName }
      )
    : {};
}

export default async function Tour({ params }: Props) {
  const { slug } = await params;
  const slugString = slug.join('/');

  const { isEnabled: draft } = await draftMode();
  const runtime = await payloadRuntime({ asVisitor: true });
  const tour = await getTour(runtime, slugString, { draft });

  if (!tour) {
    notFound();
  }

  return <TourPreview tour={tour} />;
}
