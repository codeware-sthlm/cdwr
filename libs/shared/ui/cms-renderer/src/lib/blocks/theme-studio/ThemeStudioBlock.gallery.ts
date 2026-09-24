import type { ThemeStudioBlock as ThemeStudioBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const themeStudioGallery: BlockGalleryDoc<ThemeStudioBlockProps> = {
  name: {
    en: 'The theme studio, live',
    sv: 'Temastudion, live'
  },
  summary: {
    en: 'The real theme editor in the page, with saving and export switched off.',
    sv: 'Den riktiga temaredigeraren i sidan, med sparande och export avstängt.'
  },
  whenToUse: {
    en: 'When a page claims something about themes that a visitor should be able to try rather than take on trust. It is the same component the admin opens — same derivation, same contrast report — so use it where the claim is the studio itself, and not as decoration: it is heavy, and it asks for the whole width.',
    sv: 'När en sida påstår något om teman som besökaren ska kunna pröva i stället för att lita på. Det är samma komponent som administrationen öppnar — samma härledning, samma kontrastrapport — så använd det där påståendet gäller själva studion, inte som utsmyckning: det är tungt och vill ha hela bredden.'
  },
  example: {
    blockType: 'theme-studio',
    eyebrow: 'Try it',
    heading: 'A theme you cannot save until it is readable',
    intro:
      'Pick a brand colour. Every pairing is checked for readability as you go, and one that fails cannot be published.',
    startFrom: 'spotlight',
    note: 'Live — the studio itself, not a screenshot of it. Nothing you do here leaves your browser.'
  }
};
