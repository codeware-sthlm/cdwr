import type { SiteSettingsGeneral } from '@codeware/shared/util/payload-types';
import { cva } from 'class-variance-authority';

/**
 * Colours the site icon in the header and footer, as set in site settings.
 * A flex box adds no line box around the icon, so the header row keeps its
 * height whatever the style.
 */
export const siteIconStyle = cva('flex shrink-0', {
  variants: {
    style: {
      own: '',
      brand: 'text-core-link',
      // No opacity on top: themes check the muted colour against the
      // background, and the header icon may be the home link's only content
      muted: 'text-muted-foreground'
    } satisfies Record<NonNullable<SiteSettingsGeneral['iconStyle']>, string>
  },
  defaultVariants: { style: 'own' }
});
