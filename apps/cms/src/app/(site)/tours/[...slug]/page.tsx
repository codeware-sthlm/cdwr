import { getTour } from '@codeware/app-cms/data-access';
import { draftMode } from 'next/headers';
import { notFound } from 'next/navigation';

import { payloadRuntime } from '../../../../security/payload-runtime';

import { TourPreview } from './tour-preview.client';

interface Props {
  params: Promise<{
    slug: string[];
  }>;
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
