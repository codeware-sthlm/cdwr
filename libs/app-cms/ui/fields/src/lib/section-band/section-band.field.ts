import { enumName } from '@codeware/app-cms/util/db';
import type { Field } from 'payload';

/** The name of the section band field */
export const sectionBandName = 'band' as const;

/**
 * Sets a block apart with a background drawn across the page.
 *
 * `subtle` is a tint of the page; `strong` draws the block in the theme's own
 * dark colours, whatever the visitor's colour scheme. The renderer draws the
 * band, so a block needs nothing more than this field to have one.
 */
export const sectionBandField = (): Field => ({
  name: sectionBandName,
  type: 'select',
  enumName: enumName('section_band'),
  defaultValue: 'none',
  label: { en: 'Background', sv: 'Bakgrund' },
  options: [
    { label: { en: 'None', sv: 'Ingen' }, value: 'none' },
    { label: { en: 'Subtle', sv: 'Diskret' }, value: 'subtle' },
    { label: { en: 'Strong', sv: 'Kraftig' }, value: 'strong' }
  ],
  admin: {
    description: {
      en: 'Sets the block apart with a background across the page. Strong shows it in the site’s dark colours, also in light mode.',
      sv: 'Lyfter fram blocket med en bakgrund över hela sidan. Kraftig visar det i webbplatsens mörka färger, även i ljust läge.'
    }
  }
});
