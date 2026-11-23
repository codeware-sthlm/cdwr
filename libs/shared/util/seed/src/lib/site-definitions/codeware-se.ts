import { cdwrCloudSvg } from '@codeware/shared/util/ui';

import type { SiteDefinition } from '../site-definition';

import { codewareSePrivacyMarkdown } from './codeware-se-legal';
import {
  codewareHeroIllustration,
  codewarePlatformIllustration
} from './illustrations';

/**
 * `codeware.se` — the company, as data.
 *
 * **A front, not a pitch.** Codeware is not looking for work: the site gives
 * the company a professional face, says in a few lines what kind of company it
 * is, and shows the platform it runs on. No services list, no cases, no call
 * to hire. Contact lives in the footer.
 *
 * **One page.** Anything more would be the start of a CV, and the CV is sent
 * on request. Written in the third person, as the company, in Swedish.
 */
export const codewareSe: SiteDefinition = {
  name: 'codeware.se',
  // The offer in one wording, the same in the hero and the footer
  description: 'Konsultbolag inom systemutveckling och arkitektur',

  pages: [
    {
      name: 'Hem',
      slug: 'hem',
      meta: {
        title: 'Systemutveckling och arkitektur',
        description:
          'Codeware är ett konsultbolag inom systemutveckling och arkitektur. Bolaget arbetar med verksamheter där systemen inte får stanna.'
      },
      layout: [
        {
          blockType: 'hero',
          badge: 'Codeware Sthlm',
          heading: 'Systemutveckling och arkitektur',
          lede: 'Codeware är ett konsultbolag inom systemutveckling och arkitektur. Bolaget arbetar med verksamheter där systemen inte får stanna.',
          illustration: codewareHeroIllustration
        },
        {
          blockType: 'feature-cards',
          eyebrow: 'Arbetssätt',
          band: 'subtle',
          heading: 'Så arbetar Codeware',
          columns: '3',
          items: [
            {
              title: 'Helheten först',
              description:
                'Hur systemen hänger ihop och hur informationen rör sig mellan dem avgör hur lösningen ska se ut och hur den ska förvaltas. Den bilden kommer först, koden sedan.'
            },
            {
              title: 'Håller över tid',
              description:
                'Verksamheten förändras, och kraven med den. Systemen byggs för att klara det i många år utan att behöva byggas om.'
            },
            {
              title: 'Kunskapen lämnas över',
              description:
                'Koden testas och dokumenteras, och de som tar över får det de behöver för att kunna förvalta systemet utan Codeware.'
            }
          ]
        },
        {
          // Shown, not claimed: this page is the platform at work
          blockType: 'feature-section',
          eyebrow: 'Plattformen',
          band: 'gradient',
          heading:
            'Den här sidan körs på en plattform som Codeware bygger själv',
          intro:
            'Samma plattform driver flera webbplatser, och varje webbplats har sin adress, sitt utseende och sitt innehåll. Plattformen utvecklas öppet och går att följa på cdwr.io.',
          enableLink: true,
          link: {
            type: 'custom',
            url: 'https://cdwr.io',
            label: 'Följ utvecklingen på cdwr.io',
            newTab: true
          },
          // A reference, not a call to act: nothing on this page is a button
          linkStyle: 'text',
          illustration: codewarePlatformIllustration,
          subFeatures: [
            {
              title: 'En plattform, många webbplatser',
              body: 'Varje webbplats körs för sig med sin egen domän, men alla bygger på samma kod.'
            },
            {
              title: 'Utseendet väljs i administrationen',
              body: 'Färger, typsnitt och ljust eller mörkt läge väljs utan programmering. Plattformen kontrollerar att texten går att läsa.'
            },
            {
              title: 'Granskat innan det lanseras',
              body: 'Varje ändring prövas först i en separat testmiljö, där både innehåll och kod granskas innan något publiceras.'
            }
          ]
        }
      ]
    },
    {
      name: 'Integritet',
      slug: 'privacy',
      layout: [
        {
          blockType: 'content',
          columns: [
            { size: 'full', richText: { markdown: codewareSePrivacyMarkdown } }
          ]
        }
      ]
    }
  ],

  siteSettings: {
    general: {
      // The brand, for the tab, the sharing card and beside the mark; the
      // legal name with its AB is the copyright line's alone
      appName: 'Codeware Sthlm',
      landingPage: { lookupSlug: 'hem' },
      chrome: 'flat',
      icon: { source: 'svg', svgCode: cdwrCloudSvg },
      // One theme, so no switcher: a business site should look like itself
      themes: ['codeware'],
      defaultTheme: 'codeware'
    },
    // One page, so the footer carries the rest: who, and how to reach
    footer: {
      variant: 'expanded',
      linkSource: 'none',
      // The name stands beside the mark and in the copyright; not here too
      tagline: 'Konsultbolag inom systemutveckling och arkitektur.',
      contact: [
        { platform: 'email', email: 'hello@codeware.se' },
        {
          platform: 'linkedin',
          url: 'https://www.linkedin.com/company/codeware-sthlm'
        },
        { platform: 'github', url: 'https://github.com/codeware-sthlm' },
        { platform: 'npm', url: 'https://www.npmjs.com/org/cdwr' }
      ],
      showCopyright: true,
      copyright: '© {year} Codeware Sthlm AB',
      // A business site; the release line belongs to the platform's own
      showVersion: false
    },
    // The footer links the legal pages from these settings
    legal: {
      privacyPage: { lookupSlug: 'privacy' }
    }
  }
};

export default codewareSe;
