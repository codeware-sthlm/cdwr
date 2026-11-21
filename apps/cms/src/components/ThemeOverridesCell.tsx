import { customT } from '@codeware/app-cms/util/i18n';
import type { DefaultServerCellComponentProps } from 'payload';

/**
 * Whether a theme departs from its recipe.
 *
 * A count rather than a tick: one hand-edited token and thirty are different
 * situations, and the number is what tells an author whether reopening the
 * studio will show them something they recognise.
 *
 * Both schemes are counted together. A dark override is still a departure, and
 * splitting them into two columns would say more about the storage than about
 * the theme.
 */
export const ThemeOverridesCell: React.FC<
  DefaultServerCellComponentProps<never, never>
> = ({ cellData, i18n }) => {
  const t = customT(i18n.t);

  const overrides =
    cellData && typeof cellData === 'object' && !Array.isArray(cellData)
      ? (cellData as Record<string, unknown>)
      : {};

  const count = (['light', 'dark'] as const).reduce((total, scheme) => {
    const tokens = overrides[scheme];

    return (
      total +
      (tokens && typeof tokens === 'object' && !Array.isArray(tokens)
        ? Object.keys(tokens).length
        : 0)
    );
  }, 0);

  if (!count) {
    return (
      <span
        className="text-muted-foreground opacity-40"
        title={t('themesList:overridesNoneTitle')}
      >
        —
      </span>
    );
  }

  return (
    <span
      className="text-muted-foreground text-xs whitespace-nowrap"
      title={t('themesList:overridesTitle')}
    >
      ✓ {count}
    </span>
  );
};

export default ThemeOverridesCell;
