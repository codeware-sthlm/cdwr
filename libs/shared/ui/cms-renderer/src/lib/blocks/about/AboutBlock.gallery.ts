import type { AboutBlock as AboutBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const aboutGallery: BlockGalleryDoc<AboutBlockProps> = {
  name: {
    en: 'Deployment info',
    sv: 'Driftinformation'
  },
  summary: {
    en: 'The deployment behind the page: version, commit, environment, build time.',
    sv: 'Driftsättningen bakom sidan: version, incheckning, miljö och byggtid.'
  },
  whenToUse: {
    en: 'On a page about how the site is run, such as an about or status page. The editor sets only the heading. The version, commit, environment and build time are read from the running app, so they always match the deployment that serves the page.',
    sv: 'På en sida om hur webbplatsen drivs, till exempel en om-sida eller en statussida. Redaktören anger bara rubriken. Version, incheckning, miljö och byggtid läses från appen som körs, så de stämmer alltid med den driftsättning som levererar sidan.'
  },
  example: { blockType: 'about', heading: 'About this deployment' }
};
