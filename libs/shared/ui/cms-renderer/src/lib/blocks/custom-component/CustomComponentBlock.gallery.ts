import type { OwnBuildBlockDoc } from '../gallery-doc';

/**
 * Described, not drawn: the component behind the block is written by the
 * workspace's own developer and built by the cms, so the gallery has no
 * bundle of its own to render. The Moon seed places one on its About page.
 */
export const customComponentGallery: OwnBuildBlockDoc = {
  ownBuild: true,
  name: {
    en: 'A component of your own',
    sv: 'En egen komponent'
  },
  summary: {
    en: 'A React component written in the admin, built by the platform and placed like any block.',
    sv: 'En React-komponent skriven i administrationen, byggd av plattformen och placerad som vilket block som helst.'
  },
  whenToUse: {
    en: 'When no block does what the page needs and a developer is at hand. The component is written once under Custom components, with the Inputs it takes declared beside the code; the platform type-checks and builds it on save. An editor then places it here and fills in those Inputs, on as many pages as it is wanted. Reach for a ready block first: a custom component is yours to keep working.',
    sv: 'När inget block gör det sidan behöver och en utvecklare finns till hands. Komponenten skrivs en gång under Egna komponenter, med de Inputs den tar deklarerade bredvid koden; plattformen typkontrollerar och bygger den när den sparas. En redaktör placerar den sedan här och fyller i de Inputs som behövs, på så många sidor som önskas. Välj ett färdigt block i första hand: en egen komponent är ert eget ansvar att hålla fungerande.'
  }
};
