'use client';

import { useLivePreview } from '@payloadcms/live-preview-react';

interface LivePreviewProps<T extends Record<string, any>> {
  initialData: T;
  depth?: number;
  /** Subscribe to the admin panel's updates; otherwise render `initialData` as is */
  enabled: boolean;
  children: (data: T) => React.ReactNode;
}

type LiveProps<T extends Record<string, any>> = Required<
  Omit<LivePreviewProps<T>, 'enabled'>
>;

function Live<T extends Record<string, any>>({
  initialData,
  depth,
  children
}: LiveProps<T>) {
  const { data } = useLivePreview<T>({
    initialData,
    serverURL: typeof window === 'undefined' ? '' : window.location.origin,
    depth
  });

  return <>{children(data)}</>;
}

/**
 * Generic client component for Payload live preview.
 *
 * When `enabled`, subscribes to live preview updates from the CMS admin panel
 * and passes the current data (updated as-you-type) to the render function.
 * Visitors get the page as is, so pass `enabled` only for a draft.
 * The admin and the site are one app, so the origin is the browser's own.
 *
 * @example
 * ```tsx
 * <LivePreview initialData={page} enabled={draft}>
 *   {(data) => <RenderPage page={data} blocksData={blocksData} />}
 * </LivePreview>
 * ```
 */
export function LivePreview<T extends Record<string, any>>({
  initialData,
  depth = 2,
  enabled,
  children
}: LivePreviewProps<T>) {
  if (!enabled) {
    return <>{children(initialData)}</>;
  }

  return (
    <Live initialData={initialData} depth={depth}>
      {children}
    </Live>
  );
}
