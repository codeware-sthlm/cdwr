import { getPost } from '@codeware/app-cms/data-access';
import { draftMode } from 'next/headers';
import { notFound } from 'next/navigation';

import { payloadRuntime } from '../../../../security/payload-runtime';

import { PostPreview } from './post-preview.client';

interface Props {
  params: Promise<{
    slug: string[];
  }>;
}

export default async function Post({ params }: Props) {
  const { slug } = await params;
  const slugString = slug.join('/');

  const { isEnabled: draft } = await draftMode();
  const runtime = await payloadRuntime({ asVisitor: true });
  const post = await getPost(runtime, slugString, { draft });

  if (!post) {
    notFound();
  }

  return <PostPreview post={post} />;
}
