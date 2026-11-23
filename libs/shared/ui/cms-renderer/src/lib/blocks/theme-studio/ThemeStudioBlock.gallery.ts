import type { ThemeStudioBlock as ThemeStudioBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const themeStudioGallery: BlockGalleryDoc<ThemeStudioBlockProps> = {
  summary: {
    en: 'The real theme editor in the page, with saving and export switched off.',
    sv: 'Den riktiga temaredigeraren i sidan, med sparande och export avstängt.'
  },
  whenToUse: {
    en: 'On a page about themes, to let visitors try the theme editor. It is the same editor as in the admin, with the same colour derivation and contrast report, but nothing can be saved or exported. It is heavy to load and needs the full width of the page, so use it only where the editor itself is the subject.',
    sv: 'På en sida om teman, för att låta besökare prova temaredigeraren. Det är samma redigerare som i administrationen, med samma härledning av färger och samma kontrastrapport, men inget kan sparas eller exporteras. Den är tung att ladda och behöver sidans hela bredd, så använd den bara där redigeraren själv är ämnet.'
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
