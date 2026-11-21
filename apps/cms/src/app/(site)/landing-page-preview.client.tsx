'use client';

import { RenderLandingPage } from '@codeware/shared/ui/cms-renderer';
import type { Page } from '@codeware/shared/util/payload-types';
import type { BlocksData } from '@codeware/shared/util/payload-utils';

import { LivePreview } from '../../components/LivePreview.client';

type Props = {
  landingPage: Page;
  blocksData?: BlocksData;
  live: boolean;
};

export function LandingPagePreview({ landingPage, blocksData, live }: Props) {
  return (
    <LivePreview initialData={landingPage} enabled={live}>
      {(data) => (
        <RenderLandingPage landingPage={data} blocksData={blocksData} />
      )}
    </LivePreview>
  );
}
