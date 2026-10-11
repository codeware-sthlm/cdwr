/** Outline only, or the same colour thinned out. Lines are always outlines. */
export type ShapeStyle = 'fill' | 'stroke';

/** What a thumbnail is drawn from, in a 480 x 320 space */
export type Shape =
  | {
      kind: 'rect';
      x: number;
      y: number;
      width: number;
      height: number;
      radius?: number;
      style?: ShapeStyle;
    }
  | { kind: 'circle'; cx: number; cy: number; r: number; style?: ShapeStyle }
  | {
      kind: 'line';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      thickness?: number;
    }
  | { kind: 'path'; d: string; style?: ShapeStyle };

export const WIDTH = 480;
export const HEIGHT = 320;

const round = (value: number): number => Math.round(value * 10) / 10;

/**
 * A rounded horizontal bar centred on `y`.
 *
 * Solid is a heading, soft is body text. Soft is a thin rectangle rather than a
 * translucent stroke, so every outline in a thumbnail is fully opaque.
 */
export function bar(
  x: number,
  y: number,
  width: number,
  thickness: number,
  style: ShapeStyle
): Shape {
  if (style === 'stroke') {
    return {
      kind: 'line',
      x1: round(x + thickness / 2),
      y1: y,
      x2: round(x + width - thickness / 2),
      y2: y,
      thickness
    };
  }

  return {
    kind: 'rect',
    x,
    y: round(y - thickness / 2),
    width,
    height: thickness,
    radius: thickness / 2,
    style: 'fill'
  };
}

/** A heading, centred vertically on `y` */
export function heading(x: number, y: number, width: number): Array<Shape> {
  return [bar(x, y, width, 12, 'stroke')];
}

/** A small caps line above a heading */
export function eyebrow(x: number, y: number, width = 64): Array<Shape> {
  return [bar(x, y, width, 6, 'stroke')];
}

/** Body text: `count` soft lines, the last one shorter */
export function textLines(
  x: number,
  y: number,
  width: number,
  count: number,
  gap = 16
): Array<Shape> {
  return Array.from({ length: count }, (_, index) =>
    bar(
      x,
      y + index * gap,
      index === count - 1 && count > 1 ? round(width * 0.6) : width,
      6,
      'fill'
    )
  );
}

/** A rule across a section */
export function divider(x: number, y: number, width: number): Array<Shape> {
  return [bar(x, y, width, 2, 'fill')];
}

/** A framed surface */
export function panel(
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 12
): Array<Shape> {
  return [{ kind: 'rect', x, y, width, height, radius, style: 'stroke' }];
}

/** A small solid dot */
export function dot(cx: number, cy: number, r: number): Array<Shape> {
  return [{ kind: 'circle', cx, cy, r, style: 'fill' }];
}

/** A round avatar or icon badge */
export function avatar(cx: number, cy: number, r: number): Array<Shape> {
  return [{ kind: 'circle', cx, cy, r, style: 'fill' }];
}

/** An outlined circle */
export function ring(cx: number, cy: number, r: number): Array<Shape> {
  return [{ kind: 'circle', cx, cy, r, style: 'stroke' }];
}

/** A flat colour square */
export function swatch(x: number, y: number, size: number): Array<Shape> {
  return [
    {
      kind: 'rect',
      x,
      y,
      width: size,
      height: size,
      radius: 8,
      style: 'fill'
    }
  ];
}

/** A picture frame with a mountain and a sun */
export function imageBox(
  x: number,
  y: number,
  width: number,
  height: number
): Array<Shape> {
  const at = (fx: number, fy: number): string =>
    `${round(x + width * fx)} ${round(y + height * fy)}`;

  return [
    { kind: 'rect', x, y, width, height, radius: 10, style: 'stroke' },
    {
      kind: 'path',
      d: `M${at(0.14, 0.82)}L${at(0.4, 0.44)}L${at(0.56, 0.66)}L${at(0.68, 0.52)}L${at(0.86, 0.82)}Z`,
      style: 'fill'
    },
    {
      kind: 'circle',
      cx: round(x + width * 0.72),
      cy: round(y + height * 0.26),
      r: round(Math.min(width, height) * 0.07),
      style: 'fill'
    }
  ];
}

/** A button, filled or outlined, with a label bar inside */
export function button(
  x: number,
  y: number,
  width = 104,
  height = 36,
  filled = true
): Array<Shape> {
  return [
    {
      kind: 'rect',
      x,
      y,
      width,
      height,
      radius: 8,
      style: filled ? 'fill' : 'stroke'
    },
    bar(
      round(x + width * 0.25),
      y + height / 2,
      round(width * 0.5),
      6,
      'stroke'
    )
  ];
}

/** An outlined capsule, optionally with a label bar inside */
export function pill(
  x: number,
  y: number,
  width: number,
  height = 24,
  style: ShapeStyle = 'stroke',
  label = true
): Array<Shape> {
  return [
    {
      kind: 'rect',
      x,
      y,
      width,
      height,
      radius: height / 2,
      style
    },
    ...(label
      ? [
          bar(
            round(x + height * 0.6),
            y + height / 2,
            round(width - height * 1.2),
            5,
            'stroke'
          )
        ]
      : [])
  ];
}

/** A heading with `lines` of text beneath it */
export function column(
  x: number,
  y: number,
  width: number,
  lines: number,
  gap = 16
): Array<Shape> {
  return [
    ...heading(x, y, round(width * 0.7)),
    ...textLines(x, y + 28, width, lines, gap)
  ];
}

/** A card with an icon, a title and two lines of text */
export function card(
  x: number,
  y: number,
  width: number,
  height: number
): Array<Shape> {
  const inner = width - 32;

  return [
    ...panel(x, y, width, height, 10),
    ...avatar(x + 16 + 14, y + 16 + 14, 14),
    ...heading(x + 16, y + 70, round(inner * 0.7)),
    ...textLines(x + 16, y + 98, inner, 2)
  ];
}

/** A chevron after a short bar: a text link */
export function link(x: number, y: number, width = 56): Array<Shape> {
  return [
    bar(x, y, width - 14, 5, 'stroke'),
    {
      kind: 'path',
      d: `M${x + width - 10} ${y - 5}L${x + width - 4} ${y}L${x + width - 10} ${y + 5}`
    }
  ];
}

/** Code: rows of soft lines with the indents and lengths of real source */
export function codeLines(
  x: number,
  y: number,
  width: number,
  rows: number,
  gap = 20
): Array<Shape> {
  const indents = [0, 0, 24, 24, 48, 24, 0, 0];
  const lengths = [0.34, 0.56, 0.42, 0.7, 0.3, 0.5, 0.16, 0.44];

  return Array.from({ length: rows }, (_, index) => {
    const indent = indents[index % indents.length];
    const length = lengths[index % lengths.length];
    return bar(
      x + indent,
      y + index * gap,
      round(Math.min(width * length, width - indent)),
      6,
      'fill'
    );
  });
}

/** A labelled input */
export function formField(
  x: number,
  y: number,
  width: number,
  height = 32
): Array<Shape> {
  return [
    bar(x, y, round(width * 0.3), 5, 'stroke'),
    {
      kind: 'rect',
      x,
      y: y + 14,
      width,
      height,
      radius: 6,
      style: 'stroke'
    }
  ];
}

/** A file in a list: a document, its name and size, and a download arrow */
export function fileRow(x: number, y: number, width: number): Array<Shape> {
  const arrowX = x + width - 28;
  const mid = y + 26;

  return [
    ...panel(x, y, width, 52, 10),
    {
      kind: 'rect',
      x: x + 18,
      y: y + 12,
      width: 22,
      height: 28,
      radius: 4,
      style: 'fill'
    },
    bar(x + 54, y + 18, 180, 8, 'stroke'),
    bar(x + 54, y + 36, 110, 5, 'fill'),
    {
      kind: 'path',
      d: `M${arrowX} ${mid - 8}V${mid + 6}M${arrowX - 7} ${mid}L${arrowX} ${mid + 7}L${arrowX + 7} ${mid}`
    }
  ];
}

/** An icon path for the 24 x 24 icons: a rounded rectangle */
export function roundRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): string {
  // A radius past half a side would draw a negative edge
  const r = Math.min(radius, width / 2, height / 2);
  return `M${x + r} ${y}h${width - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${height - 2 * r}a${r} ${r} 0 0 1-${r} ${r}h-${width - 2 * r}a${r} ${r} 0 0 1-${r}-${r}v-${height - 2 * r}a${r} ${r} 0 0 1 ${r}-${r}z`;
}

/** An icon path for the 24 x 24 icons: a circle */
export function circlePath(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0-${2 * r} 0`;
}
