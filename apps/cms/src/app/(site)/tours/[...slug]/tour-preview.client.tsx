'use client';

import { RenderTour } from '@codeware/shared/ui/cms-renderer';
import type { Tour } from '@codeware/shared/util/payload-types';

import { LivePreview } from '../../../../components/LivePreview.client';

type Props = {
  tour: Tour;
  live: boolean;
};

export function TourPreview({ tour, live }: Props) {
  return (
    <LivePreview initialData={tour} depth={1} enabled={live}>
      {(data) => <RenderTour tour={data} />}
    </LivePreview>
  );
}
