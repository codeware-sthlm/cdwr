import { cdwrCloudSvg } from '@codeware/shared/util/ui';

import type { SiteDefinition } from '../site-definition';

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
  description:
    'Konsultverksamhet — systemutveckling, arkitektur och mentorskap',

  pages: [
    {
      name: 'Hem',
      slug: 'hem',
      layout: [
        {
          blockType: 'hero',
          badge: 'Codeware Sthlm',
          heading: 'Mjukvara som fungerar. Även om fem år.',
          lede: 'Codeware utvecklar system och leder tekniskt arbete i verksamheter där systemen inte får stanna. Det som byggs ska fungera länge, även när den som byggde det inte längre är kvar.',
          illustration: codewareHeroIllustration
        },
        {
          blockType: 'feature-cards',
          eyebrow: 'Så arbetar Codeware',
          band: 'subtle',
          heading: 'Byggt för att kunna förvaltas, inte bara för att levereras',
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
                'Verksamheten förändras, och kraven med den. Ett system ska tåla det i många år utan att behöva byggas om.'
            },
            {
              title: 'Värdet stannar i koden',
              description:
                'Målet är att inte behövas. Det bestående värdet är det som finns kvar i koden, i testerna, i dokumentationen och hos dem som tar över, inte en person som måste finnas på plats.'
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
            'Samma plattform driver flera webbplatser, var och en med sin egen adress, sitt eget utseende och sitt eget innehåll. Den utvecklas öppet och går att följa på cdwr.io.',
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
              body: 'Varje webbplats är en egen driftsättning av samma kodbas, med egen domän och eget certifikat.'
            },
            {
              title: 'Utseendet är en konfiguration',
              body: 'Färger, typsnitt och ljust eller mörkt läge ställs in i administrationen och kontrolleras mot läsbarhetskrav.'
            },
            {
              title: 'Granskat innan det lanseras',
              body: 'Varje ändring får en egen driftsatt miljö med egen databas, så att innehåll och kod kan granskas på samma sätt.'
            }
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
      tagline: 'Arkitektur, utveckling och drift av system som ska hålla.',
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
    }
  }
};

export default codewareSe;
