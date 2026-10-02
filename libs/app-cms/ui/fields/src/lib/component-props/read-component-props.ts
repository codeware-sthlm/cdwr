import {
  type ComponentSchema,
  componentSelectFields,
  customComponentsSlug,
  parseComponentSchema
} from './component-props';

type ReadArgs = {
  /** The api route, relative to the admin's origin */
  apiRoute: string;
  id: number | string;
  signal: AbortSignal;
};

/**
 * Reads a custom component's name and declared props over REST.
 * Resolves to null when the read fails or the answer is not a component.
 */
export const readComponentSchema = async ({
  apiRoute,
  id,
  signal
}: ReadArgs): Promise<ComponentSchema | null> => {
  const params = new URLSearchParams({ depth: '0' });
  for (const field of componentSelectFields) {
    params.set(`select[${field}]`, 'true');
  }

  try {
    const response = await fetch(
      `${apiRoute}/${customComponentsSlug}/${id}?${params.toString()}`,
      { credentials: 'include', signal }
    );
    if (!response.ok) {
      console.warn(`Component props could not be read (${response.status})`);
      return null;
    }
    return parseComponentSchema(await response.json());
  } catch (error) {
    if (!signal.aborted) {
      console.warn('Component props could not be read', error);
    }
    return null;
  }
};
