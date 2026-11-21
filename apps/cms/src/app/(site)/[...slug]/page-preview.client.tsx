'use client';

import { RenderPage } from '@codeware/shared/ui/cms-renderer';
import type { Page } from '@codeware/shared/util/payload-types';
import type { BlocksData } from '@codeware/shared/util/payload-utils';

import { LivePreview } from '../../../components/LivePreview.client';

type Props = {
  page: Page;
  blocksData?: BlocksData;
  live: boolean;
};

export function PagePreview({ page, blocksData, live }: Props) {
  return (
    <LivePreview initialData={page} enabled={live}>
      {(data) => <RenderPage page={data} blocksData={blocksData} />}
    </LivePreview>
  );
}
