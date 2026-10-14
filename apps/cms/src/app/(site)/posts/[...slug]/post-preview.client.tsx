'use client';

import { RenderPost } from '@codeware/shared/ui/cms-renderer';
import type { Post } from '@codeware/shared/util/payload-types';

import { LivePreview } from '../../../../components/LivePreview.client';

type Props = {
  post: Post;
  listingPath: string | null;
  live: boolean;
};

export function PostPreview({ post, listingPath, live }: Props) {
  return (
    <LivePreview initialData={post} depth={1} enabled={live}>
      {(data) => <RenderPost post={data} listingPath={listingPath} />}
    </LivePreview>
  );
}
