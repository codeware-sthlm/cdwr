import sanitizeHtml from 'sanitize-html';

/**
 * Sanitize an SVG string to prevent XSS attacks.
 *
 * Strips disallowed tags (script, style, foreignObject, etc.) and attributes
 * (event handlers, href with javascript: scheme, etc.) while preserving
 * valid SVG structure and presentation attributes.
 *
 * Attribute names keep their case. SVG is XML, where `viewbox` is not
 * `viewBox`: an HTML page forgives it, but the same mark served as a favicon or
 * drawn into an image by itself does not, and is scaled wrongly or refused.
 */
/** The camelCase attributes kept, by the lowercase spelling older marks carry */
const CAMEL_CASE_ATTRIBUTES = new Map(
  [
    'viewBox',
    'clipPathUnits',
    'maskUnits',
    'gradientUnits',
    'gradientTransform'
  ].map((name) => [name.toLowerCase(), name])
);

/**
 * Restore the case of a known camelCase attribute.
 *
 * Marks saved before case was kept are stored as `viewbox`. Matching only the
 * right case would strip it from them, on the next render and for good on the
 * next save, so it is put right before the allow-list sees it.
 */
const restoreAttributeCase = (svg: string): string =>
  svg.replace(
    /(\s)([a-z]+)(\s*=)/gi,
    (match, space: string, name: string, equals: string) =>
      `${space}${CAMEL_CASE_ATTRIBUTES.get(name.toLowerCase()) ?? name}${equals}`
  );

export const sanitizeSvg = (svg: string): string =>
  sanitizeHtml(restoreAttributeCase(svg), {
    parser: { lowerCaseAttributeNames: false },
    allowedTags: [
      'svg',
      'g',
      'defs',
      'title',
      'desc',
      'use',
      'symbol',
      'path',
      'circle',
      'ellipse',
      'rect',
      'line',
      'polyline',
      'polygon',
      'text',
      'tspan',
      'clipPath',
      'mask',
      'linearGradient',
      'radialGradient',
      'stop'
    ],
    allowedAttributes: {
      '*': ['id', 'class'],
      svg: [
        'xmlns',
        'viewBox',
        'width',
        'height',
        'fill',
        'stroke',
        'stroke-width',
        'role',
        'aria-label',
        'aria-hidden'
      ],
      g: ['fill', 'stroke', 'stroke-width', 'opacity', 'transform'],
      path: [
        'd',
        'fill',
        'stroke',
        'stroke-width',
        'stroke-linecap',
        'stroke-linejoin',
        'fill-rule',
        'clip-rule',
        'opacity',
        'transform'
      ],
      circle: [
        'cx',
        'cy',
        'r',
        'fill',
        'stroke',
        'stroke-width',
        'opacity',
        'transform'
      ],
      ellipse: [
        'cx',
        'cy',
        'rx',
        'ry',
        'fill',
        'stroke',
        'stroke-width',
        'opacity',
        'transform'
      ],
      rect: [
        'x',
        'y',
        'width',
        'height',
        'rx',
        'ry',
        'fill',
        'stroke',
        'stroke-width',
        'opacity',
        'transform'
      ],
      line: [
        'x1',
        'y1',
        'x2',
        'y2',
        'stroke',
        'stroke-width',
        'opacity',
        'transform'
      ],
      polyline: [
        'points',
        'fill',
        'stroke',
        'stroke-width',
        'opacity',
        'transform'
      ],
      polygon: [
        'points',
        'fill',
        'stroke',
        'stroke-width',
        'opacity',
        'transform'
      ],
      text: [
        'x',
        'y',
        'fill',
        'font-size',
        'font-family',
        'text-anchor',
        'transform'
      ],
      tspan: ['x', 'y', 'dx', 'dy'],
      clipPath: ['clipPathUnits'],
      mask: ['x', 'y', 'width', 'height', 'maskUnits'],
      linearGradient: [
        'id',
        'x1',
        'y1',
        'x2',
        'y2',
        'gradientUnits',
        'gradientTransform'
      ],
      radialGradient: ['id', 'cx', 'cy', 'r', 'fx', 'fy', 'gradientUnits'],
      stop: ['offset', 'stop-color', 'stop-opacity'],
      // href intentionally omitted from <use> — xlink:href dropped automatically
      use: ['x', 'y', 'width', 'height']
    },
    allowedSchemes: [],
    disallowedTagsMode: 'discard'
  });
