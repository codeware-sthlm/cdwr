import { HEIGHT, type Shape, WIDTH } from './primitives';

/** The one colour every image is drawn in; it has to read on light and dark */
export const COLOR = '#8a8a8a';

const FILL_OPACITY = 0.3;
const STROKE_WIDTH = 3;

const round = (value: number): number => Math.round(value * 10) / 10;

function paint(style: 'fill' | 'stroke' = 'stroke'): string {
  return style === 'fill'
    ? `fill="${COLOR}" fill-opacity="${FILL_OPACITY}"`
    : `fill="none" stroke="${COLOR}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"`;
}

function element(shape: Shape): string {
  switch (shape.kind) {
    case 'rect':
      return `<rect x="${round(shape.x)}" y="${round(shape.y)}" width="${round(shape.width)}" height="${round(shape.height)}" rx="${round(shape.radius ?? 0)}" ${paint(shape.style)}/>`;
    case 'circle':
      return `<circle cx="${round(shape.cx)}" cy="${round(shape.cy)}" r="${round(shape.r)}" ${paint(shape.style)}/>`;
    case 'line':
      return `<line x1="${round(shape.x1)}" y1="${round(shape.y1)}" x2="${round(shape.x2)}" y2="${round(shape.y2)}" stroke="${COLOR}" stroke-width="${shape.thickness ?? 6}" stroke-linecap="round"/>`;
    case 'path':
      return `<path d="${shape.d}" ${paint(shape.style)}/>`;
  }
}

/** The 480 x 320 picture the block selection drawer shows */
export function renderThumbnail(shapes: Array<Shape>): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">
${shapes.map((shape) => `  ${element(shape)}`).join('\n')}
</svg>
`;
}

/** The 24 x 24 outline icon the Lexical menus show, in Lucide's drawing style */
export function renderIcon(paths: Array<string>): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="${COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
${paths.map((d) => `  <path d="${d}"/>`).join('\n')}
</svg>
`;
}
