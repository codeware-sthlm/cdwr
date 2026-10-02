import type { BuildState } from '@codeware/shared/ui/component-studio';

import { buildSelectFields, parseBuild } from './build-status';

type ReadBuildArgs = {
  /** The api route, relative to the admin's origin */
  apiRoute: string;
  collectionSlug: string;
  id: number | string;
  signal: AbortSignal;
};

/**
 * Reads a document's build group over REST, without the bundle itself.
 * Resolves to null when the read fails or the answer has no usable status.
 */
export const readBuild = async ({
  apiRoute,
  collectionSlug,
  id,
  signal
}: ReadBuildArgs): Promise<BuildState | null> => {
  const params = new URLSearchParams({ depth: '0' });
  for (const field of buildSelectFields) {
    params.set(`select[build][${field}]`, 'true');
  }

  try {
    const response = await fetch(
      `${apiRoute}/${collectionSlug}/${id}?${params.toString()}`,
      { credentials: 'include', signal }
    );
    if (!response.ok) {
      console.warn(`Build status could not be read (${response.status})`);
      return null;
    }
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null && 'build' in body
      ? parseBuild(body.build)
      : null;
  } catch (error) {
    if (!signal.aborted) {
      console.warn('Build status could not be read', error);
    }
    return null;
  }
};
