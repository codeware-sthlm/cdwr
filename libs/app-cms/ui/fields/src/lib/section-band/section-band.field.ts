import { enumName } from '@codeware/app-cms/util/db';
import type { Field } from 'payload';

/** The name of the section band field */
export const sectionBandName = 'band' as const;

/**
 * Sets a block apart with a background drawn across the page.
 *
 * `subtle` is a tint of the page; `strong` draws the block in the theme's own
 * dark colours, whatever the visitor's colour scheme; `gradient` runs the
 * theme's brand colour from deep to deepest, with text of its own. The renderer draws the
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
    { label: { en: 'Strong', sv: 'Kraftig' }, value: 'strong' },
    { label: { en: 'Gradient', sv: 'Färgtoning' }, value: 'gradient' }
  ],
  admin: {
    description: {
      en: 'Sets the block apart with a background across the page. Strong shows it in the site’s dark colours and Gradient in a deep run of its brand colour, both also in light mode.',
      sv: 'Lyfter fram blocket med en bakgrund över hela sidan. Kraftig visar det i webbplatsens mörka färger och Färgtoning i en djup toning av dess profilfärg, båda även i ljust läge.'
    }
  }
});
