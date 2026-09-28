import { cdwrCloudSvg } from '@codeware/shared/util/ui';

import type { SiteDefinition } from '../site-definition';

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
  description: 'Konsultverksamheten — systemutveckling och teknisk ledning',

  pages: [
    {
      name: 'Hem',
      slug: 'hem',
      layout: [
        {
          blockType: 'hero',
          badge: 'Teknikbolag i Stockholm',
          heading: 'Mjukvara som håller.',
          lede: 'Codeware bygger och förvaltar moderna webbplattformar. Arkitektur, utveckling och drift, med kvalitet som går att kontrollera.'
        },
        {
          blockType: 'feature-cards',
          eyebrow: 'Så arbetar Codeware',
          band: 'subtle',
          heading: 'Byggt för att förvaltas, inte bara för att levereras',
          columns: '3',
          items: [
            {
              title: 'Håller över tid',
              description:
                'System som fortsätter att fungera när de som byggde dem har gått vidare. Det är måttet, inte lanseringsdagen.'
            },
            {
              title: 'Arkitektur som bär',
              description:
                'Strukturen ett team bygger vidare på, och ansvaret för att den håller när systemet växer.'
            },
            {
              title: 'Går att granska',
              description:
                'Tester från början och en egen testmiljö för varje ändring. Kvalitet som går att kontrollera, inte bara lova.'
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
            label: 'Se plattformen',
            newTab: true
          },
          subFeatures: [
            {
              title: 'En plattform, många webbplatser',
              body: 'Varje webbplats är en egen driftsättning från samma grund, med egen domän och eget certifikat.'
            },
            {
              title: 'Utseendet är en inställning',
              body: 'Färger, typsnitt och ljust eller mörkt läge väljs i administrationen och kontrolleras mot läsbarhetskrav.'
            },
            {
              title: 'Granskat innan det går ut',
              body: 'Varje ändring får en egen körande kopia med egen databas, så innehåll och kod granskas på samma sätt.'
            }
          ]
        }
      ]
    }
  ],

  siteSettings: {
    general: {
      // The company's name: the footer shows it beside the mark
      appName: 'Codeware Sthlm AB',
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
      tagline: 'Arkitektur, utveckling och drift av moderna webbplattformar.',
      contact: [
        { platform: 'email', email: 'hello@codeware.se' },
        {
          platform: 'linkedin',
          url: 'https://www.linkedin.com/company/codeware-sthlm'
        },
        { platform: 'github', url: 'https://github.com/codeware-sthlm' },
        { platform: 'npm', url: 'https://www.npmjs.com/org/cdwr' }
      ],
      // Defaults to "© {year} <app name>", which is the company's
      showCopyright: true
    }
  }
};

export default codewareSe;
