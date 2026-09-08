import type { SocialMediaBlock as SocialMediaBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const socialMediaGallery: BlockGalleryDoc<SocialMediaBlockProps> = {
  name: {
    en: 'Where else to find you',
    sv: 'Var man hittar er i övrigt'
  },
  summary: {
    en: 'Profile links as icons, in a row or a column.',
    sv: 'Länkar till profiler som ikoner, på rad eller i en kolumn.'
  },
  whenToUse: {
    en: 'Wherever the page should hand the reader somewhere else — a footer, the end of an about page. Each platform brings its own icon, and an email or phone entry is handled the same way as a profile, so the row stays even.',
    sv: 'Där sidan ska skicka läsaren vidare — i en sidfot eller i slutet av en presentation. Varje plattform har sin egen ikon, och en e-postadress eller ett telefonnummer hanteras som vilken profil som helst, så raden hålls jämn.'
  },
  example: {
    blockType: 'social-media',
    direction: 'horizontal',
    social: [
      { id: '1', platform: 'github', url: 'https://github.com/codeware-sthlm' },
      {
        id: '2',
        platform: 'linkedin',
        url: 'https://linkedin.com/company/codeware'
      },
      { id: '3', platform: 'x', url: 'https://x.com/codeware' },
      { id: '4', platform: 'email', email: 'hello@codeware.se' }
    ]
  }
};
