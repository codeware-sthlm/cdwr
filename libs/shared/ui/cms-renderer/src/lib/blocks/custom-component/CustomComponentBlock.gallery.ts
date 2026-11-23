import type { OwnBuildBlockDoc } from '../gallery-doc';

/**
 * Described, not drawn: the component behind the block is written by the
 * workspace's own developer and built by the cms, so the gallery has no
 * bundle of its own to render. The Moon seed places one on its About page.
 */
export const customComponentGallery: OwnBuildBlockDoc = {
  ownBuild: true,
  summary: {
    en: 'A React component written in the admin, built by the platform and placed like any block.',
    sv: 'En React-komponent skriven i administrationen, byggd av plattformen och placerad som vilket block som helst.'
  },
  whenToUse: {
    en: 'When no block does what the page needs and a developer is at hand. The component is written once under Custom components, with the Inputs it takes declared beside the code; the platform type-checks and builds it on save. An editor then places it here and fills in those Inputs, on as many pages as needed. Use a ready block when one fits: a custom component has to be maintained by your own developer.',
    sv: 'När inget block gör det sidan behöver och en utvecklare finns till hands. Komponenten skrivs en gång under Egna komponenter, med de Inputs den tar deklarerade bredvid koden; plattformen typkontrollerar och bygger den när den sparas. En redaktör placerar den sedan här och fyller i de Inputs som behövs, på så många sidor som behövs. Välj ett färdigt block när det finns ett som passar: en egen komponent måste underhållas av er egen utvecklare.'
  }
};
