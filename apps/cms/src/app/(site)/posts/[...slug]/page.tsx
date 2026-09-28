import { getPost } from '@codeware/app-cms/data-access';
import type { Metadata } from 'next';
import { draftMode } from 'next/headers';
import { notFound } from 'next/navigation';

import { payloadRuntime } from '../../../../security/payload-runtime';
import { documentMetadata } from '../../../../utils/page-metadata';

import { PostPreview } from './post-preview.client';

interface Props {
  params: Promise<{
    slug: string[];
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { isEnabled: draft } = await draftMode();
  const runtime = await payloadRuntime({ asVisitor: true });
  const post = await getPost(runtime, slug.join('/'), { draft });

  return post
    ? documentMetadata(
        { name: post.title, meta: post.meta },
        { siteName: runtime.tenantConfig?.appName }
      )
    : {};
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
