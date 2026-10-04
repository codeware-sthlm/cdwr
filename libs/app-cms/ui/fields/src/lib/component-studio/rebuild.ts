import type { RebuildOutcome } from '@codeware/shared/ui/component-studio';

type RequestArgs = {
  /** The api route, relative to the admin's origin */
  apiRoute: string;
  collectionSlug: string;
  id: number | string;
};

/** Asks the server to build the stored component again. Never rejects. */
export const requestRebuild = async ({
  apiRoute,
  collectionSlug,
  id
}: RequestArgs): Promise<RebuildOutcome> => {
  try {
    const response = await fetch(
      `${apiRoute}/${collectionSlug}/${encodeURIComponent(id)}/rebuild`,
      { method: 'POST', credentials: 'include' }
    );
    if (response.status === 401 || response.status === 403) {
      return { status: 'forbidden' };
    }
    return response.ok ? { status: 'queued' } : { status: 'failed' };
  } catch (error) {
    console.warn('The component rebuild could not be requested', error);
    return { status: 'failed' };
  }
};
