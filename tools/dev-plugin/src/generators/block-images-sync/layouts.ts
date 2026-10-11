import {
  type Shape,
  avatar,
  bar,
  button,
  card,
  circlePath,
  codeLines,
  divider,
  dot,
  eyebrow,
  fileRow,
  formField,
  heading,
  imageBox,
  link,
  panel,
  pill,
  ring,
  roundRect,
  swatch,
  textLines
} from './primitives';

type BlockImages = {
  /** Drawn in a 480 x 320 space, with ~28px margins */
  thumbnail: Array<Shape>;
  /** Path data for a 24 x 24 icon; Lucide's, which is ISC licensed */
  icon: Array<string>;
};

/** The pill rows of `pill-list`: a width per pill, and which ones link */
const PILL_ROWS: Array<Array<[number, boolean]>> = [
  [
    [88, true],
    [112, false],
    [76, false],
    [104, true]
  ],
  [
    [100, false],
    [72, true],
    [112, false],
    [84, false]
  ],
  [
    [92, false],
    [120, true],
    [80, false]
  ]
];

/** Three tall cards with an icon, a title, text and a link */
const cardColumns = [28, 174, 320].flatMap((x) => [
  ...card(x, 64, 132, 176),
  ...link(x + 16, 214)
]);

/** Cards with a tag and a badge, text, two facts and a price */
const tourCards = [28, 174, 320].flatMap((x) => [
  ...panel(x, 92, 132, 192, 10),
  ...eyebrow(x + 14, 112, 40),
  ...pill(x + 84, 102, 34, 20, 'fill', false),
  ...heading(x + 14, 142, 100),
  ...textLines(x + 14, 168, 104, 3, 14),
  ...dot(x + 20, 222, 4),
  bar(x + 32, 222, 64, 5, 'fill'),
  ...dot(x + 20, 242, 4),
  bar(x + 32, 242, 48, 5, 'fill'),
  bar(x + 14, 268, 40, 8, 'stroke')
]);

export const BLOCK_IMAGES: Record<string, BlockImages> = {
  about: {
    thumbnail: [
      ...heading(28, 48, 180),
      ...panel(28, 80, 424, 200),
      ...[0, 1, 2, 3, 4].flatMap((index) => [
        bar(52, 106 + index * 36, 72, 6, 'fill'),
        bar(
          220,
          106 + index * 36,
          [120, 90, 150, 100, 130][index],
          6,
          'stroke'
        ),
        ...(index < 4 ? divider(40, 124 + index * 36, 400) : [])
      ]),
      ...dot(204, 106, 5)
    ],
    icon: [circlePath(12, 12, 10), 'M12 16v-4', 'M12 8h.01']
  },
  'block-gallery': {
    thumbnail: [28, 174, 320].flatMap((x) =>
      [36, 120, 204].flatMap((y) => [
        ...panel(x, y, 132, 72, 10),
        bar(x + 12, y + 18, 36, 5, 'stroke'),
        ...heading(x + 12, y + 38, 70),
        bar(x + 12, y + 56, 90, 5, 'fill')
      ])
    ),
    icon: [
      roundRect(3, 3, 7, 7, 1),
      roundRect(14, 3, 7, 7, 1),
      roundRect(14, 14, 7, 7, 1),
      roundRect(3, 14, 7, 7, 1)
    ]
  },
  callout: {
    thumbnail: [
      ...panel(28, 36, 424, 248, 16),
      ...avatar(240, 92, 14),
      ...heading(150, 140, 180),
      ...textLines(170, 172, 140, 1),
      ...button(192, 204, 96, 36)
    ],
    icon: [
      'M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z',
      'M12 15h.01',
      'M12 7v4'
    ]
  },
  card: {
    thumbnail: cardColumns,
    icon: [roundRect(3, 3, 18, 18, 2), 'M3 9h18']
  },
  code: {
    thumbnail: [
      ...panel(28, 40, 424, 240),
      ...dot(54, 64, 5),
      ...dot(74, 64, 5),
      ...dot(94, 64, 5),
      ...divider(28, 86, 424),
      ...codeLines(52, 112, 376, 8)
    ],
    icon: ['m18 16 4-4-4-4', 'm6 8-4 4 4 4', 'm14.5 4-5 16']
  },
  content: {
    thumbnail: [28, 178, 328].flatMap((x) => [
      ...heading(x, 56, 90),
      ...textLines(x, 92, 124, 9, 20)
    ]),
    icon: ['M21 6H3', 'M15 12H3', 'M17 18H3']
  },
  'custom-component': {
    thumbnail: [
      {
        kind: 'path',
        d: 'M132 80h-12a16 16 0 0 0-16 16v48a16 16 0 0 1-16 16a16 16 0 0 1 16 16v48a16 16 0 0 0 16 16h12'
      },
      {
        kind: 'path',
        d: 'M348 80h12a16 16 0 0 1 16 16v48a16 16 0 0 0 16 16a16 16 0 0 0-16 16v48a16 16 0 0 1-16 16h-12'
      },
      ...panel(176, 108, 128, 104, 10),
      ...heading(192, 132, 64),
      ...textLines(192, 156, 96, 2),
      ...button(192, 178, 56, 20)
    ],
    icon: [
      'M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1',
      'M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1'
    ]
  },
  'feature-cards': {
    thumbnail: [
      ...eyebrow(28, 40, 64),
      ...heading(28, 64, 220),
      ...textLines(28, 92, 300, 1),
      ...[28, 137, 246, 355].flatMap((x) => [
        ...panel(x, 132, 97, 152, 10),
        ...swatch(x + 14, 146, 28),
        ...heading(x + 14, 196, 62),
        ...textLines(x + 14, 220, 69, 3, 14)
      ])
    ],
    icon: [roundRect(3, 3, 18, 18, 2), 'M9 3v18', 'M15 3v18']
  },
  'feature-section': {
    thumbnail: [
      ...eyebrow(28, 44, 56),
      ...heading(28, 72, 190),
      ...heading(28, 96, 130),
      ...textLines(28, 128, 190, 2),
      ...button(28, 158, 88, 28, false),
      ...imageBox(252, 36, 200, 148),
      ...divider(28, 208, 424),
      ...[28, 176, 324].flatMap((x) => [
        ...heading(x, 238, 80),
        ...textLines(x, 264, 120, 2, 14)
      ])
    ],
    icon: [
      roundRect(3, 3, 18, 7, 1),
      roundRect(3, 14, 9, 7, 1),
      roundRect(16, 14, 5, 7, 1)
    ]
  },
  'file-area': {
    thumbnail: [38, 102, 166, 230].flatMap((y) => fileRow(28, y, 424)),
    icon: [
      'M12 15V3',
      'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
      'm7 10 5 5 5-5'
    ]
  },
  form: {
    thumbnail: [
      ...formField(70, 36, 340),
      ...formField(70, 96, 340),
      ...formField(70, 156, 340, 56),
      ...button(70, 244, 112, 32)
    ],
    icon: [
      'M12 20h-1a2 2 0 0 1-2-2 2 2 0 0 1-2 2H6',
      'M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7',
      'M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1',
      'M6 4h1a2 2 0 0 1 2 2 2 2 0 0 1 2-2h1',
      'M9 6v12'
    ]
  },
  hero: {
    thumbnail: [
      ...pill(28, 44, 104, 26),
      ...heading(28, 108, 380),
      ...heading(28, 134, 270),
      ...textLines(28, 174, 320, 2),
      ...button(28, 224, 112, 36),
      ...button(152, 224, 112, 36, false)
    ],
    icon: [
      'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5',
      'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09',
      'M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z',
      'M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05'
    ]
  },
  image: {
    thumbnail: [...imageBox(28, 36, 424, 200), bar(160, 266, 160, 6, 'fill')],
    icon: [
      roundRect(3, 3, 18, 18, 2),
      circlePath(9, 9, 2),
      'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'
    ]
  },
  'pill-list': {
    thumbnail: PILL_ROWS.flatMap((widths, row) => {
      let x = 28;
      return widths.flatMap(([width, linked]) => {
        const shapes = pill(
          x,
          96 + row * 44,
          width,
          28,
          linked ? 'fill' : 'stroke'
        );
        x += width + 14;
        return shapes;
      });
    }),
    icon: [
      roundRect(2, 4, 13, 6, 3),
      roundRect(17, 4, 5, 6, 3),
      roundRect(2, 14, 7, 6, 3),
      roundRect(11, 14, 11, 6, 3)
    ]
  },
  posts: {
    thumbnail: [44, 128, 212].flatMap((y, index) => [
      bar(28, y + 8, 72, 6, 'fill'),
      ...heading(128, y + 8, 260),
      ...textLines(128, y + 36, 300, 2, 14),
      ...(index < 2 ? divider(28, y + 76, 424) : [])
    ]),
    icon: [
      'M15 18h-5',
      'M18 14h-8',
      'M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2',
      roundRect(10, 6, 8, 4, 1)
    ]
  },
  'reusable-content': {
    thumbnail: [
      ...panel(28, 44, 424, 64, 12),
      ...heading(48, 66, 160),
      ...textLines(48, 90, 300, 1),
      {
        kind: 'rect',
        x: 28,
        y: 128,
        width: 424,
        height: 64,
        radius: 12,
        style: 'fill'
      },
      ...heading(48, 150, 160),
      ...textLines(48, 174, 300, 1),
      { kind: 'rect', x: 392, y: 148, width: 24, height: 16, radius: 8 },
      { kind: 'rect', x: 404, y: 148, width: 24, height: 16, radius: 8 },
      ...panel(28, 212, 424, 64, 12),
      ...heading(48, 234, 160),
      ...textLines(48, 258, 300, 1)
    ],
    icon: [
      roundRect(8, 8, 14, 14, 2),
      'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'
    ]
  },
  showcase: {
    thumbnail: [
      ...eyebrow(28, 40, 64),
      ...heading(28, 64, 200),
      ...[96, 162, 228].flatMap((y) => [
        ...divider(28, y, 424),
        ...heading(28, y + 18, 150),
        ...textLines(28, y + 34, 280, 1),
        ...pill(28, y + 44, 44, 16, 'stroke', false),
        ...pill(80, y + 44, 44, 16, 'stroke', false),
        ...link(396, y + 30)
      ])
    ],
    icon: [roundRect(3, 3, 18, 18, 2), 'M21 9H3', 'M21 15H3']
  },
  'social-media': {
    thumbnail: [-2, -1, 0, 1, 2].flatMap((step) => {
      const cx = 240 + step * 80;
      return [...ring(cx, 160, 28), ...dot(cx, 160, 9)];
    }),
    icon: [
      circlePath(18, 5, 3),
      circlePath(6, 12, 3),
      circlePath(18, 19, 3),
      'M8.59 13.51l6.83 3.98',
      'M15.41 6.51l-6.82 3.98'
    ]
  },
  spacing: {
    thumbnail: [
      ...heading(28, 52, 260),
      ...textLines(28, 80, 340, 2),
      ...divider(28, 160, 424),
      { kind: 'line', x1: 240, y1: 116, x2: 240, y2: 204, thickness: 3 },
      { kind: 'path', d: 'M231 125L240 116L249 125' },
      { kind: 'path', d: 'M231 195L240 204L249 195' },
      ...heading(28, 244, 260),
      ...textLines(28, 272, 340, 1)
    ],
    icon: [
      'M12 22v-6',
      'M12 8V2',
      'M4 12H2',
      'M10 12H8',
      'M16 12h-2',
      'M22 12h-2',
      'm15 19-3 3-3-3',
      'm15 5-3-3-3 3'
    ]
  },
  testimonial: {
    thumbnail: [
      ...panel(28, 44, 424, 232, 16),
      ...dot(64, 92, 7),
      ...dot(88, 92, 7),
      { kind: 'line', x1: 66, y1: 94, x2: 60, y2: 110, thickness: 4 },
      { kind: 'line', x1: 90, y1: 94, x2: 84, y2: 110, thickness: 4 },
      ...textLines(56, 140, 340, 3, 22),
      ...avatar(76, 232, 18),
      ...heading(108, 224, 96),
      bar(108, 244, 68, 5, 'fill')
    ],
    icon: [
      'M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z',
      'M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z'
    ]
  },
  'theme-studio': {
    thumbnail: [
      ...[0, 1, 2, 3].flatMap((row) =>
        [0, 1, 2, 3].flatMap((col) => swatch(28 + col * 50, 52 + row * 50, 40))
      ),
      ...panel(252, 52, 200, 190),
      ...heading(272, 82, 110),
      ...textLines(272, 112, 150, 3),
      ...button(272, 176, 88, 32),
      ...pill(372, 180, 60, 24, 'fill', false)
    ],
    icon: [
      'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z',
      'M13.5 6.5h.01',
      'M17.5 10.5h.01',
      'M6.5 12.5h.01',
      'M8.5 7.5h.01'
    ]
  },
  tours: {
    thumbnail: [
      ...heading(28, 44, 200),
      ...textLines(28, 68, 260, 1),
      ...tourCards
    ],
    icon: [
      'M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z',
      'M15 5.764v15',
      'M9 3.236v15'
    ]
  }
};
