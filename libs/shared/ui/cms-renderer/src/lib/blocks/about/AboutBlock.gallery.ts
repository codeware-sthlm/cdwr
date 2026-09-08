import type { AboutBlock as AboutBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const aboutGallery: BlockGalleryDoc<AboutBlockProps> = {
  name: {
    en: 'What is running, right now',
    sv: 'Vad som körs just nu'
  },
  summary: {
    en: 'The deployment behind the page: version, commit, environment, build time.',
    sv: 'Driftsättningen bakom sidan: version, incheckning, miljö och byggtid.'
  },
  whenToUse: {
    en: 'On a page about the platform rather than about the business. It takes nothing from the editor beyond a heading — the values come from the running app, so what it shows is true of the deployment serving the page and cannot be typed in wrong.',
    sv: 'På en sida som handlar om plattformen snarare än om verksamheten. Den kräver inget av redaktören utöver en rubrik — värdena kommer från appen som körs, så det som visas gäller den driftsättning som levererar sidan och kan inte skrivas in fel.'
  },
  example: { blockType: 'about', heading: 'About this deployment' }
};
