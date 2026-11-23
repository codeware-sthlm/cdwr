import type { SocialMediaBlock as SocialMediaBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const socialMediaGallery: BlockGalleryDoc<SocialMediaBlockProps> = {
  summary: {
    en: 'Profile links as icons, in a row or a column.',
    sv: 'Länkar till profiler som ikoner, på rad eller i en kolumn.'
  },
  whenToUse: {
    en: 'For links to the site’s profiles, in a footer or at the end of an about page. Each platform gets its own icon. An email address or a phone number is added the same way as a profile.',
    sv: 'För länkar till webbplatsens profiler, i en sidfot eller i slutet av en om-sida. Varje plattform får sin egen ikon. En e-postadress eller ett telefonnummer läggs till på samma sätt som en profil.'
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
