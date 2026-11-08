import type { SiteDefinition } from '../site-definition';

import { ksVininfoIconSvg } from './ks-vininfo-icon';
import { ksVininfoPrivacyMarkdown } from './ks-vininfo-legal';

/**
 * `kajstroberg.se` — Kaj Ströberg's wine trips, as data.
 *
 * **One page, from the redesign (COD-717).** A hero that fills the screen,
 * Kaj's introduction, what the trips are, photos from them, a contact form
 * that opens from any `#kontakt` link, and the travel guarantee; in Swedish.
 *
 * **No dated trip at launch.** The Alsace trip of October 2026 is over, and a
 * page announcing it would be wrong from day one. Kaj adds the next one
 * himself when it is planned.
 *
 * **A contact form, not a booking.** The old page said "Resor bokas via denna
 * sida" without any way to book. The form takes a question or a hello; dated
 * trips go to tours when there is one to show.
 *
 * **Placeholders in Kaj's introduction.** The square brackets are for Håkan and
 * Kaj to replace in the admin; nothing else on the page is a blank.
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
      filename: 'ks-vininfo-portrait.jpg',
      external: true,
      alt: 'Kaj Ströberg med mikrofonen på resebussen'
    },
    {
      filename: 'ks-vininfo-terraces.jpg',
      external: true,
      alt: 'Terrasserade vinberg i sensommarsol'
    },
    {
      filename: 'ks-vininfo-river-village.jpg',
      external: true,
      alt: 'En by vid floden nedanför sluttande vinberg'
    },
    {
      filename: 'ks-vininfo-tartelette.jpg',
      external: true,
      alt: 'Höstig tartelette med blommor'
    },
    {
      filename: 'ks-vininfo-chocolate-dessert.jpg',
      external: true,
      alt: 'Chokladdessert med körsbärssorbet'
    },
    {
      filename: 'ks-vininfo-pork.jpg',
      external: true,
      alt: 'Grillad fläskfilé med morötter och pumpa'
    },
    {
      filename: 'ks-vininfo-village-street.jpg',
      external: true,
      alt: 'En gata i en vinby'
    },
    {
      filename: 'ks-vininfo-autumn-vines.jpg',
      external: true,
      alt: 'Vinodlingar i höstfärger'
    },
    {
      filename: 'ks-vininfo-green-dessert.jpg',
      external: true,
      alt: 'Dessert med en grön kupol'
    }
  ],

  forms: [
    {
      title: 'Kontakt',
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
          placeholder: 'Vad vill du fråga om?',
          width: 6
        }
      ],
      submitLabel: 'Skicka',
      confirmation: 'Tack! Jag hör av mig så snart jag kan.',
      subject: 'Kontakt från {{email}}',
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
          layout: 'fill',
          decoration: 'horizon-lines',
          badge: 'Vinresor i Europa',
          heading: 'Vinresor med Kaj Ströberg',
          lede: 'Resor till Europas vinregioner, med besök hos gästfria producenter och tid för det lokala köket.',
          actions: [
            {
              link: {
                type: 'custom',
                url: '#kontakt',
                label: 'Hör av dig',
                newTab: false
              },
              emphasis: 'primary'
            }
          ]
        },
        {
          blockType: 'callout',
          band: 'subtle',
          showMark: false,
          heading: 'Hej, jag heter Kaj',
          // The brackets are Kaj's to fill in the admin
          body: 'Jag har ordnat vinresor sedan [ÅR]. Det började med [HUR DET BÖRJADE, EN MENING]. Vi reser i små grupper på [ANTAL] personer, och jag är själv med på varje resa. Det jag bryr mig mest om är [DET SOM ÄR VIKTIGAST FÖR KAJ, T.EX. PRODUCENTERNA, MATEN ELLER TEMPOT].',
          image: { lookupFilename: 'ks-vininfo-portrait.jpg' },
          showLink: false
        },
        {
          blockType: 'feature-section',
          eyebrow: 'Resorna',
          heading: 'Vin, mat och tid att njuta',
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
          blockType: 'gallery',
          layout: 'collage',
          // No heading: the photos continue the trips section above it
          items: [
            {
              image: { lookupFilename: 'ks-vininfo-terraces.jpg' },
              size: 'tall'
            },
            {
              image: { lookupFilename: 'ks-vininfo-river-village.jpg' },
              size: 'wide'
            },
            {
              image: { lookupFilename: 'ks-vininfo-tartelette.jpg' },
              size: 'normal'
            },
            {
              image: { lookupFilename: 'ks-vininfo-chocolate-dessert.jpg' },
              size: 'normal'
            },
            {
              image: { lookupFilename: 'ks-vininfo-pork.jpg' },
              size: 'normal'
            },
            {
              image: { lookupFilename: 'ks-vininfo-village-street.jpg' },
              size: 'tall'
            },
            {
              image: { lookupFilename: 'ks-vininfo-autumn-vines.jpg' },
              size: 'wide'
            },
            {
              image: { lookupFilename: 'ks-vininfo-green-dessert.jpg' },
              size: 'normal'
            }
          ]
        },
        {
          // Nothing on the page: every "Hör av dig" link opens it beside the page
          blockType: 'form',
          form: { lookupTitle: 'Kontakt' },
          display: 'overlay',
          anchor: 'kontakt',
          overlayTitle: 'Hör av dig',
          enableIntro: true,
          introContent: {
            markdown:
              'Har du frågor om resorna, eller vill du veta när det blir en ny resa? Skriv några rader så hör jag av mig.'
          }
        },
        {
          blockType: 'feature-section',
          band: 'subtle',
          eyebrow: 'Trygghet',
          heading: 'Vi har resegaranti hos Kammarkollegiet',
          subFeatures: [
            {
              title: 'Om vi skulle drabbas av insolvens',
              body: 'Att vi har ordnat med resegaranti innebär att du kan få ersättning om någon del av din paketresa eller sammanlänkade researrangemang blir inställd om vi skulle drabbas av insolvens.'
            },
            {
              title: 'Det som inte har fullgjorts',
              body: 'Att vi har ordnat med resegaranti betyder att du har rätt till ersättning för den del av paketresan eller sammanlänkade researrangemanget som vi ansvarar för och som inte har fullgjorts.'
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
      appName: 'KS Vininfo',
      brandLabel: 'kajstroberg.se',
      landingPage: { lookupSlug: 'hem' },
      icon: { source: 'svg', svgCode: ksVininfoIconSvg },
      themes: ['lingon'],
      defaultTheme: 'lingon',
      colorScheme: 'light'
    },
    // One page, so the footer carries who and how to reach him
    footer: {
      variant: 'expanded',
      tagline:
        'Vinresor till Europas vinregioner, med gästfria producenter och det lokala köket.',
      linkSource: 'none',
      contact: [
        {
          platform: 'email',
          email: 'kaj.stroberg@gmail.com',
          withLabel: true,
          label: 'kaj.stroberg@gmail.com'
        },
        {
          platform: 'phone',
          phone: '070-994 74 03',
          withLabel: true,
          label: '070-994 74 03'
        }
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
