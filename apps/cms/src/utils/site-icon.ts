import type { TenantIconConfig } from '@codeware/shared/util/payload-types';
import { sanitizeSvg } from '@codeware/shared/util/pure';

/** Text colours the mark takes as a favicon, where the page's own are absent */
const INK = { light: '#1f2937', dark: '#f3f4f6' } as const;

/**
 * The tenant's SVG mark, coloured for somewhere the page's styles do not reach.
 *
 * A mark drawn with `currentColor` follows the page's text in the header, but a
 * browser tab has no page text: unset, it is black, and invisible on a dark
 * tab. A style of its own gives it a colour for each scheme; a mark with fixed
 * colours is unaffected.
 *
 * @param svgCode - The mark as stored in site settings
 * @param scheme - A fixed scheme for a bitmap, which cannot follow the tab
 */
export function faviconSvg(
  svgCode: string,
  scheme?: keyof typeof INK
): string | null {
  // Through the sanitiser again: it restores the case of every camelCase
  // attribute an older mark was stored with, which a standalone SVG reader
  // needs, and the markup goes out checked as well as it came in
  const svg = sanitizeSvg(svgCode);
  const open = svg.match(/<svg\b[^>]*>/i);
  if (!open || open.index === undefined) {
    return null;
  }

  const style = scheme
    ? `<style>:root{color:${INK[scheme]}}</style>`
    : `<style>:root{color:${INK.light}}@media (prefers-color-scheme:dark){:root{color:${INK.dark}}}</style>`;
  const at = open.index + open[0].length;

  return `${svg.slice(0, at)}${style}${svg.slice(at)}`;
}

/** The mark as an SVG favicon, or null when the tenant has none in SVG */
export const svgMark = (icon: TenantIconConfig | null): string | null =>
  icon?.source === 'svg' ? icon.svgCode : null;

/**
 * The mark's size inside a square, keeping its proportions.
 *
 * An image renderer draws an `<img>` at exactly the size it is given, so a wide
 * mark in a square box comes out stretched. Read from the `viewBox`; a mark
 * without one is taken as square.
 *
 * @param svg - The mark
 * @param box - The side of the square it has to fit
 */
export function fitMark(
  svg: string,
  box: number
): { width: number; height: number } {
  const [, , w, h] = (svg.match(/\bviewBox="([^"]+)"/)?.[1] ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);

  if (!(w > 0 && h > 0)) {
    return { width: box, height: box };
  }

  return w >= h
    ? { width: box, height: Math.round((box * h) / w) }
    : { width: Math.round((box * w) / h), height: box };
}

/** An SVG as a data URI, for drawing it into a bitmap */
export const svgDataUri = (svg: string): string =>
  `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
