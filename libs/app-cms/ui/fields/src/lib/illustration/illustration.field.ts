import { customT } from '@codeware/app-cms/util/i18n';
import { sanitizeSvg } from '@codeware/shared/util/pure';
import type { TextareaField } from 'payload';

/** Whether sanitised code is a drawing, with an `<svg>` at its root. */
const isSvg = (code: string): boolean => /^<svg[\s>]/i.test(code.trim());

/**
 * What is stored for a drawing: the code sanitised, or nothing when it is
 * blank or not SVG. Either would otherwise count as a drawing and push the
 * block's image aside for an empty box.
 */
export const storedIllustration = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  if (!value.trim()) return null;
  const code = sanitizeSvg(value);
  return isSvg(code) ? code : null;
};

/** Says so in the admin when the code is not a drawing, rather than dropping it. */
export const validateIllustration = (value: unknown): boolean =>
  typeof value !== 'string' || !value.trim() || isSvg(sanitizeSvg(value));

/**
 * A drawing in SVG code, shown in a block's visual slot.
 *
 * Drawn inline rather than as an image, so it can use the theme's own colours
 * — `var(--brand-500)`, `var(--foreground)`, `var(--card)` — and recolours when
 * the visitor switches theme or scheme. Not localized: a drawing carries no
 * text. Sanitised as it is saved, and again when it is drawn.
 */
export const illustrationField = (): TextareaField => ({
  name: 'illustration',
  type: 'textarea',
  label: { en: 'Illustration', sv: 'Illustration' },
  hooks: {
    beforeChange: [({ value }) => storedIllustration(value)]
  },
  validate: (value, { req: { t } }) =>
    validateIllustration(value) || customT(t)('validation:svgCode'),
  admin: {
    description: {
      en: 'SVG code, drawn in the page itself. Colours can use the theme, such as var(--brand-500) or var(--foreground), so it follows a change of theme. Shown instead of the visual when both are set.',
      sv: 'SVG-kod som ritas direkt i sidan. Färger kan hämtas från temat, till exempel var(--brand-500) eller var(--foreground), så att den följer med när temat byts. Visas i stället för bilden när båda är angivna.'
    }
  }
});
