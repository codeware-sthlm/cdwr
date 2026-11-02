import type { SiteDefinition } from '../site-definition';

import { ksVininfoPrivacyMarkdown } from './ks-vininfo-legal';

/**
 * `kajstroberg.se` — Kaj Ströberg's wine trips, as data.
 *
 * **One page, rebuilt from the one.com site.** The old page is a presentation
 * of Kaj, what the trips are and the travel guarantee; it stays that, in
 * Swedish.
 *
 * **No dated trip at launch.** The Alsace trip of October 2026 is over, and a
 * page announcing it would be wrong from day one. Kaj adds the next one
 * himself when it is planned; until then the page says one is on its way.
 *
 * **An interest form.** The old page said "Resor bokas via denna sida" without
 * any way to book. The form takes an expression of interest, not a booking.
 *
 * **Tours wait.** The platform's tours are for a dated trip with a programme;
 * with none to show, there is nothing to put in them yet.
 *
 * **The form's recipient is a placeholder.** `hello@ks-vininfo.dev`, the one
 * every workspace gets, so the seed and previews never mail Kaj. At go-live the
 * form's recipient is changed to his address (COD-710).
 */
export const ksVininfo: SiteDefinition = {
  name: 'kajstroberg.se',
  description: 'Kaj Ströbergs vinresor',

  media: [
    {
      filename: 'ks-vininfo-header.jpg',
      external: true,
      alt: 'Vinodlingar och olivlundar på kullarna nedanför en by på en höjd'
    },
    {
      filename: 'ks-vininfo-portrait.jpg',
      external: true,
      alt: 'Kaj Ströberg med mikrofonen på resebussen'
    }
  ],

  forms: [
    {
      title: 'Intresseanmälan',
      fields: [
        {
          blockType: 'text',
          name: 'name',
          label: 'Namn',
          required: true,
          width: 6
        },
        {
          blockType: 'email',
          name: 'email',
          label: 'E-post',
          required: true,
          width: 3
        },
        {
          blockType: 'text',
          name: 'phone',
          label: 'Telefon',
          width: 3
        },
        {
          blockType: 'textarea',
          name: 'message',
          label: 'Meddelande',
          placeholder: 'Vilken resa är du intresserad av, och hur många är ni?',
          width: 6
        }
      ],
      submitLabel: 'Skicka intresseanmälan',
      confirmation: 'Tack! Jag hör av mig när nästa resa är klar.',
      subject: 'Intresseanmälan från {{email}}',
      // A development placeholder, so the seed and previews never mail Kaj; at
      // go-live the form's recipient is changed to his address (COD-710)
      emailTo: 'hello@ks-vininfo.dev'
    }
  ],

  pages: [
    {
      name: 'Hem',
      slug: 'hem',
      meta: {
        title: 'Vinresor med Kaj Ströberg',
        description:
          'Resor till Europas vinregioner, med besök hos gästfria producenter och tid för det lokala köket.'
      },
      layout: [
        {
          blockType: 'hero',
          heading: 'Vinresor med Kaj Ströberg',
          lede: 'Resor till Europas vinregioner, med besök hos gästfria producenter och tid för det lokala köket.',
          media: { lookupFilename: 'ks-vininfo-header.jpg' }
        },
        {
          blockType: 'feature-section',
          band: 'subtle',
          heading: 'Hej',
          intro:
            'Jag heter Kaj Ströberg och ordnar vinresor för dig som vill komma närmare vinet, maten och människorna bakom dem.',
          media: { lookupFilename: 'ks-vininfo-portrait.jpg' },
          subFeatures: [
            {
              title: 'Gästfria producenter',
              body: 'Vi möter högklassiga producenter som tar emot oss på plats.'
            },
            {
              title: 'Det lokala köket',
              body: 'Vi lär känna regionens kök på hög nivå.'
            },
            {
              title: 'Bra boende',
              body: 'Bra hotell med bra läge, och efter innehållsrika dagar tid både för vila och för att på egen hand upptäcka platsen.'
            }
          ]
        },
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Kommande resor\n\nNästa resa planeras just nu. Anmäl ditt intresse nedan, så hör jag av mig när program och datum är klara.'
              }
            }
          ]
        },
        {
          blockType: 'form',
          form: { lookupTitle: 'Intresseanmälan' },
          enableIntro: true,
          introContent: {
            markdown:
              '## Anmälan\n\nAnmälan tas emot i turordning. Du kan anmäla dig här, mejla till kaj.stroberg@gmail.com eller ringa 070-994 74 03.'
          }
        },
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '### Vi har resegaranti hos Kammarkollegiet\n\nAtt vi har ordnat med resegaranti innebär att du kan få ersättning om någon del av din paketresa eller sammanlänkade researrangemang blir inställd om vi skulle drabbas av insolvens.\n\nAtt vi har ordnat med resegaranti betyder att du har rätt till ersättning för den del av paketresan eller sammanlänkade researrangemanget som vi ansvarar för och som inte har fullgjorts.'
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Integritet',
      slug: 'integritet',
      layout: [
        {
          blockType: 'content',
          columns: [
            { size: 'full', richText: { markdown: ksVininfoPrivacyMarkdown } }
          ]
        }
      ]
    }
  ],

  siteSettings: {
    general: {
      appName: 'kajstroberg.se',
      landingPage: { lookupSlug: 'hem' },
      // The icon is left to the default: the definition can only state SVG
      themes: ['lingon'],
      defaultTheme: 'lingon',
      colorScheme: 'light'
    },
    // One page, so the footer carries who and how to reach him
    footer: {
      variant: 'standard',
      linkSource: 'none',
      contact: [
        { platform: 'email', email: 'kaj.stroberg@gmail.com' },
        { platform: 'phone', phone: '070-994 74 03' }
      ],
      showCopyright: true,
      copyright: '© {year} Kaj Ströberg',
      showVersion: false
    },
    // The privacy page states this period; its legal vars carry the same number
    forms: { retentionDays: 365 },
    // The footer links the legal pages from these settings
    legal: {
      privacyPage: { lookupSlug: 'integritet' }
    }
  }
};

export default ksVininfo;
