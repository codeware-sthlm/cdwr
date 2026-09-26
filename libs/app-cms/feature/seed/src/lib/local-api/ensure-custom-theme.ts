import { getId } from '@codeware/app-cms/util/misc';
import {
  type ThemeRecipe,
  type ThemeTokens,
  buildThemeTokens
} from '@codeware/shared/util/color';
import type { CustomTheme } from '@codeware/shared/util/payload-types';
import type { Payload } from 'payload';

export type CustomThemeData = Pick<CustomTheme, 'tenant'> & {
  name: string;
  /** The `data-theme` value, and the lookup key per tenant */
  slug: string;
  recipe: ThemeRecipe;
  overrides?: { light?: ThemeTokens; dark?: ThemeTokens };
};

/**
 * Ensure a theme of the tenant's own exists, derived from its decisions.
 *
 * The token maps are built with the same `buildThemeTokens` call the studio
 * makes when it saves, so a theme applied from a definition is exactly the one
 * the studio would have stored, and reopens there as its recipe. The
 * collection's own validation still runs, so a recipe whose colours fail the
 * contrast check is refused here the same way it is in the admin.
 *
 * @returns The created theme, or the id when the tenant already has the slug
 */
export async function ensureCustomTheme(
  payload: Payload,
  data: CustomThemeData,
  options: {
    transactionID: string | number | undefined;
    /** Written on create only; an existing document is never claimed */
    managedBy?: string;
  }
): Promise<CustomTheme | number> {
  const { transactionID, managedBy } = options;
  const { name, slug, recipe, overrides, tenant } = data;

  const existing = await payload.find({
    collection: 'custom-themes',
    where: {
      and: [
        { slug: { equals: slug } },
        tenant ? { tenant: { in: [getId(tenant)] } } : {}
      ]
    },
    depth: 0,
    limit: 1,
    req: { transactionID }
  });

  if (existing.totalDocs) {
    return existing.docs[0].id;
  }

  const { light, dark } = buildThemeTokens(recipe, overrides);

  return payload.create({
    collection: 'custom-themes',
    data: {
      ...(managedBy ? { managedBy } : {}),
      name,
      slug,
      tenant,
      recipe,
      // Stored the way the studio stores them: both schemes, empty when none
      overrides: { light: overrides?.light ?? {}, dark: overrides?.dark ?? {} },
      tokensLight: light,
      tokensDark: dark
    },
    req: { transactionID }
  });
}
