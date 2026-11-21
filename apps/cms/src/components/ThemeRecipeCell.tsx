import { customT } from '@codeware/app-cms/util/i18n';
import { fontById, normaliseRecipe } from '@codeware/shared/util/color';
import type { DefaultServerCellComponentProps } from 'payload';

const capitalise = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

/**
 * The decisions behind a theme, at a glance in the list.
 *
 * A cell rather than columns, because a recipe is one JSON field: Payload has
 * nothing to sort or filter on here, and five columns of one-word values would
 * cost more width than they return.
 *
 * Read through `normaliseRecipe`, so a theme saved before a field existed shows
 * that field's default rather than a gap — the same reason the studio can open
 * one at all.
 *
 * Order matches the studio's controls: base, brand, heading, body, surface.
 * Two places, one order, so the summary reads as the form that produced it.
 */
export const ThemeRecipeCell: React.FC<
  DefaultServerCellComponentProps<never, never>
> = ({ cellData, i18n }) => {
  const recipe = normaliseRecipe(cellData);
  const t = customT(i18n.t);

  // Each value is one word out of context, so the label says what it decides —
  // not what it is, which is already on screen. A native `title` rather than a
  // tooltip component: the cell renders on the server, and a label for a
  // one-word value does not need a client bundle.
  const parts = [
    {
      id: 'base',
      label: t('themesList:baseTitle'),
      value: capitalise(recipe.baseFamily)
    },
    {
      id: 'brand',
      label: t('themesList:brandTitle'),
      value: capitalise(recipe.brandFamily)
    },
    {
      id: 'heading',
      label: t('themesList:headingFontTitle'),
      value: fontById(recipe.fontHeading)?.label ?? recipe.fontHeading
    },
    {
      id: 'body',
      label: t('themesList:bodyFontTitle'),
      value: fontById(recipe.fontBody)?.label ?? recipe.fontBody
    },
    {
      id: 'surface',
      label: t('themesList:surfaceTitle'),
      value: capitalise(recipe.surface)
    }
  ];

  return (
    <span className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
      {parts.map(({ id, label, value }, index) => (
        <span key={id} className="whitespace-nowrap">
          <span title={label}>{value}</span>
          {index < parts.length - 1 && (
            <span aria-hidden className="px-1 opacity-40">
              ·
            </span>
          )}
        </span>
      ))}
    </span>
  );
};

export default ThemeRecipeCell;
