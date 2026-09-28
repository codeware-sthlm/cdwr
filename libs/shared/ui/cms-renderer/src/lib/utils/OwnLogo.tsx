import { InlineIcon } from '@codeware/shared/ui/primitives';

/** A block's own-logo group, as every block carrying one stores it */
export type OwnLogoValue =
  | {
      source?: 'svg' | 'upload' | null;
      svgCode?: string | null;
      /** Only its address is read, so any loaded upload fits; an id is not */
      file?: number | { url?: string | null } | null;
    }
  | null
  | undefined;

/**
 * What a stated logo draws from, or null when there is nothing to draw.
 *
 * Decided from the data, so a caller can ask before rendering: an element is
 * always truthy, even one that renders nothing. An upload given only as an id
 * is an unpopulated relation, and counts as nothing rather than a broken image.
 */
export function resolveOwnLogo(
  logo: OwnLogoValue
): { svgCode: string } | { src: string } | null {
  const { source, svgCode, file } = logo ?? {};

  if (source === 'svg' && svgCode) {
    return { svgCode };
  }
  if (source === 'upload' && file && typeof file === 'object' && file.url) {
    return { src: file.url };
  }
  return null;
}

/** A mark of the tenant's own, from SVG code or an uploaded image */
export function OwnLogo({ logo, size }: { logo: OwnLogoValue; size: number }) {
  const mark = resolveOwnLogo(logo);

  return mark && <InlineIcon {...mark} size={size} />;
}
