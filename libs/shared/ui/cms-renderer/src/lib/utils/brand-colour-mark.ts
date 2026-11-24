import { cva } from 'class-variance-authority';

/**
 * Recolours an SVG logo to the text colour, where it paints.
 *
 * Only an element with a `fill` or `stroke` attribute that is not `none` is
 * touched, the `svg` itself included, so a stroke-only icon stays an outline
 * and a gap stays a gap. Nothing inside `mask`, `clipPath` or `defs` is
 * touched: there the colour is a cut-out, not paint.
 */
export const brandColourMark = cva([
  '[&_:is(svg,svg_*)[fill]:not([fill=none]):not(:is(mask,clipPath,defs,mask_*,clipPath_*,defs_*))]:fill-current',
  '[&_:is(svg,svg_*)[stroke]:not([stroke=none]):not(:is(mask,clipPath,defs,mask_*,clipPath_*,defs_*))]:stroke-current'
]);
