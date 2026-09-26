// This file is custom generated and should not be edited unless necessary.

import { capitalize } from '@codeware/shared/util/pure';

import { faqData } from './faq-data';
import { readMediaFiles, readStockMediaFiles } from './read-media-files';

const tenantSlug = {
  cdwrIo: 'cdwr-io',
  moon: 'moon',
  sun: 'sun',
  star: 'star'
} as const;

const tenants = {
  cdwrIo: { apiKey: '9d5316b1-0298-4113-904c-6cc10fcacb6c' },
  moon: { apiKey: 'b9c2fb25-df77-4304-a60a-028779a2cb37' },
  sun: { apiKey: 'f3799063-d55e-43ab-a96f-b6a386ced985' },
  star: { apiKey: 'a76d0168-f9b2-48d2-bc57-96e45aaf8542' }
} as const;

const tenantApiKeys = Object.values(tenants).map(({ apiKey }) => apiKey);

// Extract the record values, which are the final string representations of the tenant slugs.
export type TenantSlug = (typeof tenantSlug)[keyof typeof tenantSlug];

/**
 * Seed data for **DEVELOPMENT** environment.
 *
 * @param remoteDataUrl Optionally read remote media files from a URL, otherwise read local media files.
 * @returns Base seed data for the application.
 */
export const seedData = (remoteDataUrl: string | undefined) => {
  const mediaFiles = readMediaFiles(remoteDataUrl);
  const stockFiles = Object.fromEntries(
    readStockMediaFiles(remoteDataUrl).map(({ filePath, filename }) => [
      filename,
      filePath
    ])
  );
  if (mediaFiles.length === 0) {
    console.warn('No media files found for seeding.');
  }

  return {
    categories: [
      {
        name: 'Star Types',
        slug: 'star-types',
        tenant: { lookupApiKey: tenants.star.apiKey }
      },
      {
        name: 'Star Clusters',
        slug: 'star-clusters',
        tenant: { lookupApiKey: tenants.star.apiKey }
      },
      {
        name: 'Stellar Evolution',
        slug: 'stellar-evolution',
        tenant: { lookupApiKey: tenants.star.apiKey }
      },
      {
        name: 'Lunar Features',
        slug: 'lunar-features',
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        name: 'Moon Phases',
        slug: 'moon-phases',
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        name: 'Planetary Moons',
        slug: 'planetary-moons',
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        name: 'Solaktivitet',
        slug: 'solar-activity',
        tenant: { lookupApiKey: tenants.sun.apiKey }
      },
      {
        name: 'Solsystem',
        slug: 'solar-system',
        tenant: { lookupApiKey: tenants.sun.apiKey }
      }
    ],
    faq: faqData(),
    // All tenants are seeded with file area media files
    media: tenantApiKeys.flatMap((lookupApiKey) =>
      mediaFiles.map(({ filePath, filename }) => ({
        alt: capitalize(filename.replace(/-/g, ' ').replace(/\.[^/.]+$/, '')),
        external: true,
        filename,
        filePath,
        tags: [{ lookupSlug: 'file-area' }],
        tenant: { lookupApiKey }
      }))
    ),
    pages: [
      {
        name: 'Moon Members',
        header: 'For members of the Moon workspace',
        layoutContent:
          '## Members only 🔒\nThis page is restricted to signed-in members of the Moon workspace. The public site must never render it, and a member of another workspace must not see it either.\n',
        slug: 'moon-members',
        tenant: { lookupApiKey: tenants.moon.apiKey },
        visibility: 'members' as const
      },
      {
        name: 'Red Giants',
        header: 'Massive Stars in Their Late Stage',
        layoutContent:
          "## Red Giants 🔴\nRed giants are stars that have exhausted the hydrogen fuel in their cores and expanded to many times their original size.\n### Characteristics of Red Giants\nRed giants have cooler surface temperatures than main sequence stars, giving them their characteristic reddish color. Despite their lower surface temperature, they are extremely luminous due to their enormous size.\n\nBetelgeuse in the constellation Orion is one of the most famous red giants visible to the naked eye. Its diameter is so large that if placed at the center of our solar system, it would extend beyond the orbit of Mars.\n\nRed giants represent a relatively short phase in stellar evolution. Our own Sun will eventually become a red giant in about 5 billion years, expanding to engulf Mercury and Venus and possibly reaching Earth's orbit.\n\nThe expansion occurs when a star's core hydrogen is depleted, causing the core to contract and heat up while the outer layers expand and cool. This process significantly alters a star's properties in terms of temperature, luminosity, and size.\n\nAfter the red giant phase, intermediate-mass stars like our Sun will shed their outer layers to form a planetary nebula with a white dwarf at the center. More massive stars may continue to heavier elements fusion before ending as supernovae.\n",
        slug: 'red-giants',
        tenant: { lookupApiKey: tenants.star.apiKey }
      },
      {
        name: 'Binary Stars',
        header: 'Stellar Systems with Two Stars',
        layoutContent:
          '## Binary Stars ⭐⭐\nBinary star systems consist of two stars orbiting around their common center of mass.\n### Types of Binary Systems\nBinary stars are extremely common in our galaxy, with more than half of all Sun-like stars believed to exist in binary or multiple-star systems. They come in several varieties, including visual binaries (can be resolved through telescopes), spectroscopic binaries (detected through spectrum analysis), and eclipsing binaries (where stars pass in front of each other from our perspective).\n\nThe study of binary stars is crucial for determining stellar masses. By analyzing their orbital motions, astronomers can calculate the masses of the component stars with great precision - information that\'s difficult to obtain for isolated stars.\n\nBinary star systems can evolve in fascinating ways, especially when the stars have different masses. The more massive star will reach the giant phase first, potentially transferring material to its companion. This interaction can lead to novae, type Ia supernovae, and the formation of exotic objects like neutron stars and black holes.\n\nAlgol, also known as the "Demon Star," is a famous eclipsing binary in the Perseus constellation. Its brightness noticeably dims approximately every 2.87 days when the dimmer star passes in front of the brighter one from our perspective.\n\nSome binary systems contain a stellar remnant like a white dwarf, neutron star, or black hole, making them important laboratories for studying extreme physics.\n',
        slug: 'binary-stars',
        tenant: { lookupApiKey: tenants.star.apiKey }
      },
      {
        name: 'Neutron Stars',
        header: 'Ultra-Dense Stellar Remnants',
        layoutContent:
          '## Neutron Stars 🌟\nNeutron stars are the incredibly dense remnants of massive stars that have ended their lives in supernovae.\n### Properties of Neutron Stars\nNeutron stars are among the densest objects known in the universe. They pack roughly 1.4 solar masses into a sphere only about 20 kilometers in diameter. A teaspoon of neutron star material would weigh billions of tons on Earth.\n\nDespite their small size, neutron stars have extremely powerful magnetic fields, often trillions of times stronger than Earth\'s. They also rotate incredibly rapidly, with some completing multiple rotations per second. As they rotate, their magnetic fields sweep through space, creating beams of radiation that we can detect as pulses when they point toward Earth - these are known as pulsars.\n\nThe discovery of pulsars in 1967 by Jocelyn Bell Burnell was a landmark achievement in astronomy. Initially, the regular pulsations were so precise that they were briefly considered possible signals from alien civilizations, nicknamed "LGM" (Little Green Men).\n\nNeutron stars can exist in binary systems with ordinary stars, white dwarfs, or even other neutron stars. When a neutron star pulls material from a companion, it can create spectacular X-ray emissions and other high-energy phenomena.\n\nThe extreme conditions within neutron stars cannot be replicated in laboratories on Earth, making them unique cosmic laboratories for studying matter under extreme pressure and density.\n',
        slug: 'neutron-stars',
        tenant: { lookupApiKey: tenants.star.apiKey }
      },
      {
        name: 'Lunar Maria',
        header: 'The Dark Plains of the Moon',
        layoutContent:
          "## Lunar Maria 🌑\nLunar maria are the dark, basaltic plains on the Moon formed by ancient volcanic eruptions.\n### Formation and Characteristics\nThe term \"maria\" (Latin for \"seas\") dates back to early astronomers who mistook these dark regions for actual bodies of water. We now know they are vast solidified flows of basaltic lava that erupted billions of years ago.\n\nLunar maria cover about 16% of the Moon's surface, primarily on the near side. The most prominent maria include Mare Imbrium (Sea of Rains), Mare Serenitatis (Sea of Serenity), and Mare Tranquillitatis (Sea of Tranquility) - where humans first landed during the Apollo 11 mission.\n\nThese dark plains formed between 3 and 3.5 billion years ago when molten magma from the Moon's interior flooded large impact basins. The maria are significantly younger than the lighter, heavily cratered highland regions that make up most of the lunar surface.\n\nThe maria contain fewer craters than the highlands because they formed later in the Moon's history, after the heaviest period of meteorite bombardment. They also contain higher concentrations of iron-rich minerals, which gives them their darker appearance.\n\nSamples returned by Apollo astronauts revealed that maria basalts differ in composition from Earth's volcanic rocks, providing important clues about the Moon's formation and evolution.\n",
        slug: 'lunar-maria',
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        name: 'Lunar Craters',
        header: 'Impact Features on the Moon',
        layoutContent:
          '## Lunar Craters 🌕\nLunar craters are bowl-shaped depressions formed by meteoroid impacts on the Moon\'s surface.\n### Formation and Significance\nWithout atmospheric protection, the Moon has preserved a record of impacts spanning more than 4 billion years. The largest lunar craters exceed 200 kilometers in diameter, while the smallest are microscopic. This preserved impact history makes the Moon an invaluable cosmic time capsule.\n\nCraters typically feature a raised rim, an interior bowl, and sometimes a central peak formed when the surface rebounded after impact. Larger impacts can create complex crater structures with terraced walls and multiple peaks.\n\nSome of the most prominent lunar craters include Tycho, with its distinctive ray system of ejected material stretching hundreds of kilometers; Copernicus, often called the "Monarch of the Moon"; and Clavius, one of the largest craters visible from Earth.\n\nThe distribution and density of craters in different regions help scientists determine the relative ages of lunar surfaces. Heavily cratered areas are generally older, having been exposed to impacts for a longer period. This principle was crucial in understanding the Moon\'s geological history.\n\nLunar craters are named after notable scientists, philosophers, and explorers. This naming convention, established by the International Astronomical Union, honors figures like Copernicus, Kepler, and Aristotle.\n',
        slug: 'lunar-craters',
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        name: 'Lunar Phases',
        header: 'The Changing Face of the Moon',
        layoutContent:
          '## Lunar Phases 🌓\nLunar phases are the different appearances of the Moon as seen from Earth during its monthly orbit.\n### The Lunar Cycle\nThe Moon completes a full cycle of phases approximately every 29.5 days, a period known as a synodic month. This cycle begins with the New Moon (when the Moon is between Earth and the Sun), proceeds through waxing phases as more of the illuminated side becomes visible, reaches Full Moon (when the Moon and Sun are on opposite sides of Earth), and then wanes until returning to New Moon.\n\nThe primary phases in order are: New Moon, Waxing Crescent, First Quarter, Waxing Gibbous, Full Moon, Waning Gibbous, Last Quarter, and Waning Crescent. At First and Last Quarter phases, exactly half of the Moon\'s visible face is illuminated.\n\nLunar phases occur because the Moon orbits Earth while both bodies orbit the Sun. As the Moon moves around Earth, the angle between the Sun, Moon, and Earth changes, altering which portion of the Moon\'s sunlit side is visible from our perspective.\n\nThe Moon always presents approximately the same face toward Earth due to tidal locking. This synchronous rotation means that the Moon\'s rotation period matches its orbital period around Earth, resulting in one side (the near side) always facing us, while the far side remains hidden from direct view.\n\nThroughout history, lunar phases have been used to track time, with many calendars based on the lunar cycle. The words "month" and "moon" share etymological roots in many languages, reflecting this ancient connection.\n',
        slug: 'lunar-phases',
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        name: 'Solfläckar',
        header: 'Kraftfulla utbrott på solens yta',
        layoutContent:
          '## Solfläckar ☀️\nSolfläckar är massiva explosioner på solens yta som frigör energi, ljus och hög hastighet partiklar i rymden.\n### Bildning och påverkan\nSolfläckar uppstår nära solfläckar, tillfälliga mörka fläckar på solens yta där intensiva magnetfält uppträder. Dessa magnetfält kan bli vridna och plötsligt återansluta, vilket frigör enorma mängder energi. En typisk stor flare kan frigöra energi motsvarande miljontals 100-megaton vätebomber som exploderar samtidigt.\n\nFrekvensen av solfläckar följer den 11-åriga solcykeln, med fler fläckar under solmaximum när solfläckaktiviteten är högst. Fläckar klassificeras efter deras röntgenljusstyrka, med de mest kraftfulla som X-klass fläckar, följt av M, C, B och A-klass fläckar i minskande ordning av intensitet.\n\nStrålningen från solfläckar kan störa radiokommunikation, GPS-navigering och elnät på jorden. De kan också utgöra en strålningsrisk för astronauter och elektronisk utrustning i rymden. Den mest kraftfulla registrerade fläcken, Carrington-händelsen 1859, orsakade norrsken synliga så långt söderut som Karibien och störde telegrafsystem världen över.\n\nNASA och andra rymdorganisationer övervakar kontinuerligt solen för fläckaktivitet med satelliter som Solar Dynamics Observatory (SDO) och Solar and Heliospheric Observatory (SOHO). Dessa observationer hjälper forskare att bättre förstå solfysik och ge tidiga varningar om potentiellt störande solhändelser.\n\nSolfläckar är ofta associerade med koronala massutkast (CMEs), massiva moln av solplasma som kan färdas genom rymden med hastigheter på flera miljoner miles per timme, och potentiellt nå jorden inom 1-3 dagar.\n',
        slug: 'solar-flares',
        tenant: { lookupApiKey: tenants.sun.apiKey }
      },
      {
        name: 'Solvinden',
        header: 'Strömmen av partiklar från solen',
        layoutContent:
          '## Solvinden 🌞\nSolvinden är en kontinuerlig ström av laddade partiklar (främst elektroner och protoner) som strömmar ut från solen i alla riktningar.\n### Egenskaper och effekter\nSolvinden har sitt ursprung i solens korona, det yttersta lagret av solens atmosfär där temperaturerna överstiger en miljon grader Celsius. Vid dessa temperaturer kan solens gravitation inte hålla kvar de snabbt rörliga partiklarna, vilket gör att de kan undkomma ut i rymden.\n\nSolvinden färdas med hastigheter som varierar från 300 till 800 kilometer per sekund (ungefär 1 till 2 miljoner miles per timme). Den bär med sig solens magnetfält, vilket skapar det vi kallar heliosfären - en enorm bubbla av solens inflytande som sträcker sig långt bortom Pluto.\n\nNär solvinden interagerar med jordens magnetfält skapas en skyddande magnetosfär runt vår planet, som skyddar oss från mycket av solens strålning. Vissa partiklar kan dock tränga in nära polerna och kollidera med atmosfäriska molekyler, vilket skapar de vackra norrsken (aurora borealis) och sydsken (aurora australis).\n\nSolvinden är inte uniform utan varierar i densitet, temperatur och hastighet. "Snabb" solvind kommer från koronala hål, områden där solens magnetfält sträcker sig ut i rymden utan att återvända. "Långsam" solvind kommer från områden nära solens ekvator under perioder med låg solaktivitet.\n\nInteraktionen mellan solvinden och det interstellära mediet skapar en gräns som kallas heliopausen, som Voyager-sonden korsade 2012 och blev de första människotillverkade objekten att komma in i interstellärt utrymme.\n',
        slug: 'solar-wind',
        tenant: { lookupApiKey: tenants.sun.apiKey }
      },
      {
        name: 'Solens dynamo',
        header: 'Motorn bakom solaktiviteten',
        layoutContent:
          '## Solens dynamo 🧲☀️\nSolens dynamo är mekanismen som genererar solens magnetfält och driver dess 11-åriga aktivitetscykel.\n### Hur det fungerar\nSolens dynamo fungerar genom de kombinerade effekterna av differentialrotation och konvektion inom solen. Solen roterar inte som en solid kropp - dess ekvator fullbordar en rotation på cirka 25 dagar, medan polerna tar cirka 35 dagar. Denna differentialrotation sträcker och lindar magnetfältlinjerna, medan konvektionsströmmar lyfter och vrider dem.\n\nDenna process skapar en självförsörjande dynamoeffekt som kontinuerligt regenererar solens magnetfält. Med tiden blir fältet alltmer komplext och vridet, vilket leder till ökande antal solfläckar, flares och andra magnetiska fenomen - det vi observerar som solens maximala period i cykeln.\n\nSå småningom blir magnetfältet så trassligt att det i princip "återställer" sig självt i en process som kallas magnetisk rekoppling. Fältet förenklas och byter polaritet, vilket börjar nästa cykel med att de magnetiska nord- och sydpolerna byts. Denna fullständiga cykel, från en polaritet till samma polaritet igen, tar cirka 22 år (två 11-åriga solfläckscykler).\n\nSolens dynamo fungerar inte med konstant hastighet. Historiska register visar perioder med ovanligt låg aktivitet, såsom Maunder Minimum (1645-1715), när solfläckar var extremt sällsynta och Europa upplevde en "Liten istid." Detta antyder en potentiell koppling mellan solens magnetiska aktivitet och jordens klimat, även om det exakta sambandet fortfarande är ett aktivt forskningsområde.\n\nStudier av solens dynamo hjälper forskare att förutsäga solaktivitet, vilket är avgörande för att förutse rymdväderhändelser som kan påverka satelliter, elnät och telekommunikation på jorden.\n',
        slug: 'solar-dynamo',
        tenant: { lookupApiKey: tenants.sun.apiKey }
      },
      {
        name: 'Home',
        slug: 'home',
        tenant: { lookupApiKey: tenants.star.apiKey },
        hero: {
          badge: 'Star',
          heading: 'We are all made of stars.',
          lede: 'A luminous sphere of plasma, held together by gravity, generating energy through nuclear fusion at its core.',
          actions: [
            {
              link: { url: '/red-giants', label: 'Explore' },
              emphasis: 'primary' as const
            },
            {
              link: { url: '/binary-stars', label: 'Binary Stars' },
              emphasis: 'secondary' as const
            }
          ]
        },
        featureCards: {
          eyebrow: 'Discover',
          heading: 'Explore the Universe',
          intro:
            'From massive red giants to ultra-dense neutron stars, discover the fascinating world of stellar astronomy.',
          columns: '3' as const,
          items: [
            {
              brand: { icon: 'FireIcon', color: 'red-500' },
              title: 'Red Giants',
              description:
                'Massive stars in their late stage, expanding to many times their original size.'
            },
            {
              brand: { icon: 'StarIcon', color: 'indigo-400' },
              title: 'Binary Stars',
              description:
                'Stellar systems with two stars orbiting their common center of mass.'
            },
            {
              brand: { icon: 'SparklesIcon', color: 'purple-500' },
              title: 'Neutron Stars',
              description:
                'Ultra-dense stellar remnants formed from the cores of massive supernovae.'
            }
          ]
        },
        callout: {
          showMark: true,
          heading: 'Curious about the cosmos?',
          body: 'Dive deeper into our collection of stellar astronomy articles.',
          link: { url: '/binary-stars', label: 'Read articles' }
        }
      },
      {
        name: 'Home',
        slug: 'home',
        tenant: { lookupApiKey: tenants.moon.apiKey },
        hero: {
          badge: 'Moon',
          heading: 'Look at the silver moon.',
          lede: 'A natural satellite that orbits a planet or other celestial body larger than itself.',
          actions: [
            {
              link: { url: '/lunar-maria', label: 'Explore' },
              emphasis: 'primary' as const
            },
            {
              link: { url: '/lunar-craters', label: 'Lunar Craters' },
              emphasis: 'secondary' as const
            }
          ]
        },
        featureCards: {
          eyebrow: 'Discover',
          heading: 'The Moon Up Close',
          intro:
            "From dark volcanic plains to ancient craters, explore the many faces of Earth's closest celestial neighbour.",
          columns: '3' as const,
          items: [
            {
              brand: { icon: 'GlobeAltIcon', color: 'stone-500' },
              title: 'Lunar Maria',
              description:
                'Dark basaltic plains formed by volcanic eruptions that flooded ancient impact basins.'
            },
            {
              brand: { icon: 'MapPinIcon', color: 'gray-400' },
              title: 'Lunar Craters',
              description:
                'Bowl-shaped depressions preserving over 4 billion years of impact history.'
            },
            {
              brand: { icon: 'MoonIcon', color: 'yellow-300' },
              title: 'Lunar Phases',
              description:
                'The changing appearance of the Moon during its monthly orbit around Earth.'
            }
          ]
        },
        callout: {
          showMark: true,
          heading: 'Fascinated by the Moon?',
          body: 'Learn more about lunar geology, atmosphere and the history of lunar exploration.',
          link: { url: '/lunar-maria', label: 'Read articles' }
        }
      },
      {
        name: 'Hem',
        slug: 'home',
        tenant: { lookupApiKey: tenants.sun.apiKey },
        hero: {
          badge: 'Sun',
          heading: 'Sommar och sol.',
          lede: 'Solen är den centrala stjärnan i vårt planetsystem, runt vilken planeter, månar och asteroider kretsar.',
          actions: [
            {
              link: { url: '/solar-flares', label: 'Utforska' },
              emphasis: 'primary' as const
            },
            {
              link: { url: '/solar-wind', label: 'Solvinden' },
              emphasis: 'secondary' as const
            }
          ]
        },
        featureCards: {
          eyebrow: 'Utforska',
          heading: 'Vår stjärna – solen',
          intro:
            'Från mäktiga solutbrott till mystiska solcykler – utforska vetenskapen bakom vår livgivande stjärna.',
          columns: '3' as const,
          items: [
            {
              brand: { icon: 'BoltIcon', color: 'orange-500' },
              title: 'Solfläckar',
              description:
                'Massiva explosioner på solens yta som frigör enorm energi och påverkar hela solsystemet.'
            },
            {
              brand: { icon: 'GlobeAltIcon', color: 'sky-400' },
              title: 'Solvinden',
              description:
                'Den kontinuerliga strömmen av laddade partiklar som strömmar ut från solen i alla riktningar.'
            },
            {
              brand: { icon: 'Cog6ToothIcon', color: 'blue-400' },
              title: 'Solens dynamo',
              description:
                'Mekanismen som genererar solens magnetfält och driver dess 11-åriga aktivitetscykel.'
            }
          ]
        },
        callout: {
          showMark: true,
          heading: 'Nyfiken på solen?',
          body: 'Fördjupa dig i vår samling av artiklar om solaktivitet och solsystemet.',
          link: { url: '/solar-flares', label: 'Läs artiklar' }
        }
      }
    ],
    stockMedia: [
      {
        alt: 'A vineyard hut among green vines above a wide plain',
        subject: 'vineyard hut',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-hut-1.jpg',
        filePath: stockFiles['stock-hut-1.jpg']
      },
      {
        alt: 'A stone vineyard hut on a slope under soft overcast light',
        subject: 'vineyard hut',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-hut-2.jpg',
        filePath: stockFiles['stock-hut-2.jpg']
      },
      {
        alt: 'A river loop below vineyard slopes, village on the bend',
        subject: 'river valley',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-rivervalley-1.jpg',
        filePath: stockFiles['stock-rivervalley-1.jpg']
      },
      {
        alt: 'A river loop seen over a dry stone wall from the vineyards',
        subject: 'river valley',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-rivervalley-2.jpg',
        filePath: stockFiles['stock-rivervalley-2.jpg']
      },
      {
        alt: 'Rolling vineyard country framed by vine leaves',
        subject: 'rolling hills',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-rollinghills-2.jpg',
        filePath: stockFiles['stock-rollinghills-2.jpg']
      },
      {
        alt: 'Steep terraced vineyards above a valley town',
        subject: 'terraces',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-terraces-1.jpg',
        filePath: stockFiles['stock-terraces-1.jpg']
      },
      {
        alt: 'Terraced vineyard slopes under a pale overcast sky',
        subject: 'terraces',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-terraces-2.jpg',
        filePath: stockFiles['stock-terraces-2.jpg']
      },
      {
        alt: 'Layered vineyard terraces rising up a valley side',
        subject: 'terraces',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-terraces-3.jpg',
        filePath: stockFiles['stock-terraces-3.jpg']
      },
      {
        alt: 'A wine village with a church spire below green slopes',
        subject: 'village',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-village-1.jpg',
        filePath: stockFiles['stock-village-1.jpg']
      },
      {
        alt: 'Red tiled roofs of a wine village seen through vine leaves',
        subject: 'village',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-village-2.jpg',
        filePath: stockFiles['stock-village-2.jpg']
      },
      {
        alt: 'A village church spire above the vineyards',
        subject: 'village',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-village-3.jpg',
        filePath: stockFiles['stock-village-3.jpg']
      },
      {
        alt: 'Trellised vine rows running toward distant hills',
        subject: 'vine rows',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-vinerows-1.jpg',
        filePath: stockFiles['stock-vinerows-1.jpg']
      },
      {
        alt: 'Vine rows behind a dry stone wall on a hillside',
        subject: 'vine rows',
        credit: 'FLUX 1.1 pro ultra via Replicate',
        licence: 'AI generated — commercial use permitted',
        filename: 'stock-vinerows-2.jpg',
        filePath: stockFiles['stock-vinerows-2.jpg']
      }
    ],
    places: [
      {
        name: 'Tranquility Base Camp',
        kind: 'hotel',
        url: 'https://example.com/tranquility-base-camp',
        note: 'Eight cabins around a shared observation dome.',
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        name: 'Hypatia Rille Station',
        kind: 'activity',
        url: 'https://example.com/hypatia-rille',
        note: 'Field geology outpost on the eastern rille.',
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        name: 'Shackleton Ice Lab',
        kind: 'activity',
        url: 'https://example.com/shackleton-ice-lab',
        note: 'Working survey lab on the crater floor.',
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        name: 'Cerro Paranal Lodge',
        kind: 'hotel',
        url: 'https://example.com/paranal-lodge',
        note: 'Blackout rooms and a terrace facing south.',
        tenant: { lookupApiKey: tenants.star.apiKey }
      },
      {
        name: 'Atacama Array',
        kind: 'activity',
        url: 'https://example.com/atacama-array',
        note: 'Professional array on the plateau, daytime visits only.',
        tenant: { lookupApiKey: tenants.star.apiKey }
      },
      {
        name: 'Abisko Fjällstation',
        kind: 'hotel',
        url: 'https://example.com/abisko',
        note: 'Basläger med utsikt över Torneträsk.',
        tenant: { lookupApiKey: tenants.sun.apiKey }
      },
      {
        name: 'Solobservatoriet',
        kind: 'activity',
        url: 'https://example.com/solobservatoriet',
        note: 'Observation i vitt ljus och H-alfa.',
        tenant: { lookupApiKey: tenants.sun.apiKey }
      }
    ],
    posts: [
      {
        title: 'Supergiant Stars',
        slug: 'supergiant-stars',
        createdAt: '2026-01-10',
        authors: [{ lookupEmail: 'antares@local.dev' }],
        categories: [{ lookupSlug: 'star-types' }],
        content:
          "# Supergiant Stars\nSupergiant stars are the most massive and luminous stars in the universe. These stellar giants have exhausted the hydrogen in their cores and expanded to enormous sizes. Betelgeuse in the constellation Orion is a famous example, with a diameter roughly 700 times that of our Sun.\n\nThese stars have relatively short lifespans of only a few million years compared to the billions of years that smaller stars like our Sun live. Their enormous mass causes them to burn through their nuclear fuel at an accelerated rate.\n\nDespite their rarity, supergiants have played a crucial role in the universe's evolution. When they die in spectacular supernova explosions, they create and distribute heavy elements throughout the cosmos that eventually form new stars, planets, and even life.\n\n## Observational Characteristics\nSupergiants come in different spectral types from blue to red. Blue supergiants like Rigel are extremely hot with surface temperatures around 20,000 Kelvin, while red supergiants like Antares are cooler (around 3,500 Kelvin) but much larger in physical size.\n\nThe extreme luminosity of these stars makes them visible across vast cosmic distances, allowing astronomers to use them as standard candles for measuring distances to other galaxies. Their atmospheres also provide valuable laboratories for studying stellar physics under extreme conditions.\n\n",
        tenant: { lookupApiKey: tenants.star.apiKey }
      },
      {
        title: 'White Dwarf Stars',
        slug: 'white-dwarf-stars',
        createdAt: '2026-03-23',
        authors: [{ lookupEmail: 'vega@local.dev' }],
        categories: [{ lookupSlug: 'star-types' }],
        content:
          '# White Dwarf Stars\nWhite dwarfs represent the final evolutionary state for the vast majority of stars in our universe, including our Sun. These stellar remnants form when stars of low to medium mass have exhausted their nuclear fuel and shed their outer layers.\n\nDespite having masses comparable to our Sun, white dwarfs are incredibly dense, compressing that mass into a volume roughly the size of Earth. A sugar cube-sized piece of white dwarf material would weigh approximately one ton on Earth.\n\nThese stars no longer produce energy through nuclear fusion. Instead, they slowly cool over billions of years, eventually fading to black dwarfs (though the universe isn\'t old enough for any white dwarfs to have cooled completely yet).\n\n## Physical Properties\nWhite dwarfs are supported against gravitational collapse by electron degeneracy pressure, a quantum mechanical effect that prevents electrons from occupying the same energy states. This creates an upper mass limit called the Chandrasekhar limit (about 1.4 solar masses) beyond which electron degeneracy cannot prevent collapse.\n\nIn binary systems, white dwarfs can pull material from companion stars, sometimes leading to nova explosions when hydrogen accumulates on their surfaces and undergoes fusion. If a white dwarf accumulates enough mass to approach the Chandrasekhar limit, it may explode as a Type Ia supernova, which astronomers use as "standard candles" for measuring cosmic distances.\n\n',
        tenant: { lookupApiKey: tenants.star.apiKey }
      },
      {
        title: 'The Hertzsprung-Russell Diagram',
        slug: 'the-hertzsprung-russell-diagram',
        createdAt: '2026-03-31',
        authors: [{ lookupEmail: 'vega@local.dev' }],
        categories: [{ lookupSlug: 'stellar-evolution' }],
        content:
          "# The Hertzsprung-Russell Diagram\nThe Hertzsprung-Russell (H-R) diagram is one of the most important tools in stellar astronomy, providing a graphical relationship between stars' luminosities and their surface temperatures or spectral classifications. Developed independently by Ejnar Hertzsprung and Henry Norris Russell in the early 1900s, this diagram revolutionized our understanding of stellar evolution.\n\nThe diagram plots stars with temperature or spectral class on the x-axis (hottest to coolest, moving right) and luminosity or absolute magnitude on the y-axis (brightest at the top). When stars are plotted this way, they don't distribute randomly but instead fall into distinct groupings that reveal their evolutionary stages.\n\nThe main sequence is a diagonal band running from the upper left (hot, luminous stars) to the lower right (cool, dim stars) where stars spend most of their hydrogen-burning lives. Our Sun is a G-type main sequence star situated in the middle regions of this band.\n\n## Evolutionary Tracks\nAs stars evolve, they move to different regions of the H-R diagram. When a main sequence star exhausts its core hydrogen, it moves upward and rightward to become a red giant. More massive stars evolve into supergiants in the upper right portion of the diagram.\n\nThe diagram also shows white dwarfs clustered in the lower left - hot but dim stars in their final evolutionary stages. By studying a star's position on the H-R diagram and how that position changes over time, astronomers can determine its age, mass, and evolutionary stage, making this diagram an invaluable tool for understanding stellar lifecycles.\n\n",
        tenant: { lookupApiKey: tenants.star.apiKey }
      },
      {
        title: 'Open Star Clusters',
        slug: 'open-star-clusters',
        createdAt: '2026-09-06',
        authors: [{ lookupEmail: 'vega@local.dev' }],
        categories: [{ lookupSlug: 'star-clusters' }],
        content:
          '# Open Star Clusters\nOpen star clusters are groups of stars that formed together from the same giant molecular cloud and remain loosely bound by mutual gravitational attraction. Unlike their densely packed cousins, globular clusters, open clusters typically contain younger stars (a few million to a few billion years old) and are found primarily in the spiral arms of galaxies.\n\nThe Milky Way contains thousands of open clusters, though only about 1,100 have been discovered and cataloged. Famous examples include the Pleiades (Seven Sisters), the Hyades in Taurus, and the Double Cluster in Perseus. Most open clusters contain between a few dozen and a few thousand stars.\n\nOpen clusters are astronomical treasure troves because all their stars formed at roughly the same time from the same molecular cloud. This means they have the same age and initial chemical composition but different masses. This makes them perfect laboratories for testing theories of stellar evolution, as astronomers can observe how stars of different masses evolve from the same starting point.\n\n## Cluster Evolution\nOver time, open clusters gradually disperse as their stars are stripped away by the gravitational influence of passing molecular clouds or other clusters. This process accelerates as the cluster orbits through the galactic disk, encountering more disruptive forces.\n\nOur Sun likely formed in an open cluster about 4.6 billion years ago, but that cluster has long since dispersed. By studying the chemical signatures of stars, astronomers can sometimes identify "siblings" of our Sun—stars that formed in the same cluster but have since been scattered throughout the galaxy.\n\n',
        tenant: { lookupApiKey: tenants.star.apiKey }
      },
      {
        title: 'Lunar Highlands',
        slug: 'lunar-highlands',
        createdAt: '2026-10-01',
        authors: [{ lookupEmail: 'titan@local.dev' }],
        categories: [{ lookupSlug: 'lunar-features' }],
        content:
          "# Lunar Highlands\nThe lunar highlands are the light-colored, heavily cratered regions that make up approximately 83% of the Moon's surface. These ancient terrains provide a window into the early history of our solar system, preserving a record of the intense meteorite bombardment that occurred over 4 billion years ago.\n\nUnlike the darker lunar maria, the highlands consist primarily of anorthosite, a rock composed largely of the mineral plagioclase feldspar. This composition gives the highlands their characteristic bright appearance when viewed from Earth.\n\nThe highlands represent the Moon's original crust, formed when lighter minerals floated to the surface of a molten lunar magma ocean shortly after the Moon's formation. This crust solidified around 4.5 billion years ago, making the highlands some of the oldest accessible surfaces in our solar system.\n\n## Scientific Significance\nThe heavily cratered nature of the highlands provides crucial information about the early bombardment history of the inner solar system. This period, known as the Late Heavy Bombardment, affected all inner planets, but Earth's active geology has erased most evidence of this violent epoch.\n\nApollo 16 was the only mission to land specifically in the lunar highlands, collecting samples that revealed the anorthositic composition of these regions. These samples have been crucial for understanding the Moon's formation and early evolution, suggesting that the Moon likely formed from debris ejected when a Mars-sized body collided with the early Earth.\n\n",
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        title: 'The Lunar Atmosphere',
        slug: 'the-lunar-atmosphere',
        createdAt: '2026-10-15',
        authors: [{ lookupEmail: 'titan@local.dev' }],
        categories: [{ lookupSlug: 'lunar-features' }],
        content:
          "# The Lunar Atmosphere\nContrary to popular belief, the Moon does have an atmosphere, albeit an extremely tenuous one. This \"exosphere\" is so thin that its molecules rarely collide with each other, making it fundamentally different from the atmospheres of Earth or Mars.\n\nThe lunar atmosphere contains several elements including helium, argon, neon, sodium, and potassium, with a total mass of only about 10 metric tons spread across the entire Moon. By comparison, Earth's atmosphere has a mass of about 5 quadrillion metric tons.\n\nSeveral sources contribute to this tenuous atmosphere: solar wind particles captured by the Moon's weak gravitational field, outgassing from the lunar interior, and material vaporized by micrometeorite impacts. The composition varies with the lunar day/night cycle and is influenced by solar activity.\n\n## Scientific Interest\nStudying the lunar atmosphere helps scientists understand surface-exosphere interactions on airless bodies throughout the solar system. The Lunar Atmosphere and Dust Environment Explorer (LADEE) mission, which orbited the Moon in 2013-2014, made detailed measurements of this exosphere's composition and density variations.\n\nThe Moon's near-vacuum environment makes it an excellent location for certain types of astronomical observations. Without atmospheric distortion, telescopes placed on the lunar surface could achieve exceptional clarity, particularly on the far side where they would also be shielded from Earth's radio emissions.\n\n",
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        title: 'Lunar Water',
        slug: 'lunar-water',
        createdAt: '2026-09-06',
        authors: [{ lookupEmail: 'phobos@local.dev' }],
        categories: [{ lookupSlug: 'lunar-features' }],
        content:
          "# Lunar Water\nFor decades, scientists believed the Moon was completely dry. This view changed dramatically in recent years as multiple missions detected the presence of water on our celestial neighbor, a discovery with profound implications for lunar science and future human exploration.\n\nWater exists on the Moon in multiple forms. Water ice is concentrated in permanently shadowed craters near the lunar poles where temperatures remain below -158°C (-250°F), cold enough to trap water molecules for billions of years. Additionally, hydration has been detected in the lunar regolith (soil) across the surface, likely in the form of hydroxyl groups (OH) bonded to minerals.\n\nThe lunar water likely comes from multiple sources: cometary impacts, interaction between the solar wind and oxygen-bearing minerals in the lunar soil, and possibly primordial water trapped during the Moon's formation. Understanding these sources helps reveal the Moon's history and evolution.\n\n## Importance for Exploration\nWater is a precious resource for space exploration. It can be split into hydrogen and oxygen for rocket fuel or life support systems, and of course, astronauts need it for drinking and other uses. The presence of accessible water could significantly reduce the mass that future missions need to launch from Earth.\n\nNASA's Artemis program, which aims to return humans to the Moon by the mid-2020s, plans to investigate lunar water resources and potentially demonstrate in-situ resource utilization technologies. The lunar south pole, with its relatively high concentration of water ice, has been selected as the target region for these missions precisely because of its potential water resources.\n\n",
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        title: "The Moon's Formation",
        slug: 'the-moons-formation',
        createdAt: '2026-10-20',
        authors: [{ lookupEmail: 'phobos@local.dev' }],
        categories: [{ lookupSlug: 'planetary-moons' }],
        content:
          "# The Moon's Formation\nThe origin of the Moon has fascinated humans since ancient times, but only in recent decades have scientists developed a compelling theory for its formation. The currently accepted model, known as the Giant Impact Hypothesis, suggests that about 4.5 billion years ago, a Mars-sized body (sometimes called Theia) collided with the proto-Earth.\n\nThis catastrophic impact ejected a vast amount of material from both the impactor and Earth's mantle into orbit around our planet. Within this debris disk, material began to coalesce, eventually forming the Moon. This violent birth explains several key observations about the Earth-Moon system.\n\nComputer simulations of the impact event closely match the current Earth-Moon system, including the Moon's relatively small iron core compared to Earth's. The hypothesis also accounts for the Moon's loss of volatile elements and explains why the Moon's orbit is in the same plane as Earth's equator.\n\n## Evidence for the Theory\nSamples returned by Apollo missions have been crucial in supporting the Giant Impact Theory. Moon rocks show isotopic compositions remarkably similar to Earth's mantle, suggesting a common origin, but they contain significantly less water and other volatile elements, consistent with the high-energy, high-temperature conditions of a giant impact.\n\nThe Moon's slightly elongated orbit and the fact that it's slowly receding from Earth (currently at a rate of about 3.8 centimeters per year) are also consistent with this formation model. Additionally, the Moon's density and internal structure—with a small core making up only about 20% of its volume compared to Earth's core at 30%—align with predictions of the impact hypothesis.\n\n",
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        title: 'Solens Kärna',
        slug: 'the-solar-core',
        createdAt: '2026-11-01',
        authors: [{ lookupEmail: 'rigel@local.dev' }],
        categories: [{ lookupSlug: 'solar-activity' }],
        content:
          '# Solens Kärna\nI hjärtat av vår sol ligger dess kärna, en region med extrema förhållanden där kärnfusion driver vårt solsystem. Trots att den är relativt liten—och upptar endast cirka 20-25% av solens radie—innehåller kärnan ungefär 60% av solens massa på grund av dess otroliga densitet.\n\nKärnans temperatur når otroliga 15 miljoner grader Celsius (27 miljoner grader Fahrenheit), och dess tryck överstiger 200 miljarder gånger jordens atmosfärstryck. Under dessa extrema förhållanden tvingas väte-kärnor samman för att bilda helium genom kärnfusion, vilket frigör enorma mängder energi i processen.\n\nDenna energi, initialt i form av gammastrålar, påbörjar en resa som tar tusentals år att nå solens yta och slutligen jorden. Partiklarna interagerar otaliga gånger på vägen utåt, förlorar gradvis energi och omvandlas från gammastrålar till synligt ljus som slutligen strålar ut i rymden.\n\n## Detektion och Studier\nMänniskor har aldrig direkt observerat solens kärna—den är dold under tusentals kilometer av het plasma. Forskare har dock utvecklat geniala metoder för att studera den indirekt.\n\nHelioseismologi, studiet av oscillationer som sprider sig genom solen, tillåter astronomer att "se" inuti vår stjärna på samma sätt som seismologer använder jordbävningsvågor för att studera jordens inre. Dessutom kan neutriner—nästan masslösa subatomära partiklar som produceras under fusionsreaktioner—undkomma kärnan direkt och detekteras på jorden, vilket ger ett realtidsfönster in i de nukleära processerna som sker i solens centrum.\n\n',
        tenant: { lookupApiKey: tenants.sun.apiKey }
      },
      {
        title: 'Solens Cykler',
        slug: 'solar-cycles',
        createdAt: '2026-11-15',
        authors: [{ lookupEmail: 'rigel@local.dev' }],
        categories: [{ lookupSlug: 'solar-activity' }],
        content:
          '# Solens Cykler\nSolen, långt från att vara ett statiskt objekt, går igenom regelbundna cykler av aktivitet som påverkar vårt solsystem på djupet. Den mest framträdande av dessa är den ungefär 11-åriga solfläckscykeln, under vilken antalet solfläckar—mörka, magnetiskt intensiva områden på solens yta—stiger och sjunker i ett relativt förutsägbart mönster.\n\nVid solminimum kan solen visa få eller inga solfläckar under dagar eller veckor. När aktiviteten ökar mot solmaximum kan dussintals solfläckar dyka upp samtidigt, åtföljda av ökade solutbrott, koronamassutkastningar och andra energirika fenomen. Dessa cykler har observerats och registrerats sedan tidigt 1600-tal, vilket ger en av astronomins längsta kontinuerliga dataserier.\n\nSolcykeln är faktiskt ett magnetiskt fenomen. Under varje cykel reverserar solens magnetfält helt polaritet, vilket innebär att en full magnetisk cykel tar ungefär 22 år—två 11-åriga solfläckscykler. Denna reversering sker vid solmaximum, när fältet är som mest trassligt och kaotiskt.\n\n## Effekter på jorden\nSolcykler har många effekter på jorden och mänsklig teknik. Under solmaximum kan ökad solaktivitet störa radiokommunikation, skada satelliter, skapa strålningsrisker för astronauter och till och med orsaka strömavbrott. De spektakulära norrsken och sydsken blir mer frekventa och synliga på lägre latituder under dessa aktiva perioder.\n\nForskare har också identifierat potentiella kopplingar mellan solcykler och jordens klimat, även om dessa samband är komplexa och föremål för pågående forskning. Historiska register visar perioder av ovanligt låg solaktivitet, såsom Maunder Minimum (1645-1715), som sammanföll med en period av kallare temperaturer i Europa känd som "Lilla istiden." Att förstå dessa samband är fortfarande viktigt för klimatforskning.\n\n',
        tenant: { lookupApiKey: tenants.sun.apiKey }
      },
      {
        title: 'Heliosfären',
        slug: 'the-heliosphere',
        createdAt: '2026-12-01',
        authors: [{ lookupEmail: 'rigel@local.dev' }],
        categories: [{ lookupSlug: 'solar-system' }],
        content:
          '# Heliosfären\nHeliosfären är den enorma bubbelliknande regionen i rymden som domineras av solens magnetfält och solvind. Denna skyddande kappa skyddar vårt solsystem från den hårda interstellära strålningsmiljön och representerar solens sfär av fysisk påverkan.\n\nSolvinden—en ström av laddade partiklar som kontinuerligt strömmar utåt från solen i alla riktningar—skapar och upprätthåller heliosfären. När denna supersoniska vind färdas utåt, saktar den slutligen ner när den möter motstånd från det interstellära mediet, vilket bildar en gräns kallad termination shock. Bortom detta ligger heliosheath, en turbulent region där solvinden komprimeras och saktas ytterligare.\n\nDen yttersta gränsen för heliosfären är heliopausen, där trycket från solvinden balanserar med trycket från det interstellära mediet. Detta markerar den verkliga kanten av vårt solsystem när det gäller solens partikel- och magnetpåverkan. Bortom detta ligger interstellär rymd.\n\n## Utforskning och upptäckt\nÅr 2012 blev NASAs Voyager 1-rymdfarkost det första människotillverkade objektet att korsa heliopausen och gå in i interstellär rymd, följt av Voyager 2 år 2018. Dessa historiska korsningar gav oöverträffade data om gränsvillkoren mellan vårt solsystem och interstellär rymd.\n\nFormen på heliosfären har varit föremål för vetenskaplig debatt. Även om den ofta avbildas som kometliknande med en lång svans, tyder nyare forskning på att den kan vara mer sfärisk eller croissantformad. Interstellar Boundary Explorer (IBEX)-uppdraget har kartlagt gränsregionerna sedan 2008 och avslöjat oväntade funktioner, inklusive ett "band" av energirika neutrala atomer som verkar vara i linje med det lokala interstellära magnetfältet.\n\n',
        tenant: { lookupApiKey: tenants.sun.apiKey }
      },
      {
        title: 'Solens Atmosfär',
        slug: 'the-suns-atmosphere',
        createdAt: '2026-12-15',
        authors: [{ lookupEmail: 'ross@local.dev' }],
        categories: [{ lookupSlug: 'solar-activity' }],
        content:
          '# Solens Atmosfär\nTill skillnad från jordens atmosfär med dess väldefinierade gräns, består solens atmosfär av flera distinkta lager som sträcker sig från dess synliga yta ut i rymden. Dessa lager uppvisar fascinerande och ibland kontraintuitiva egenskaper som fortsätter att utmana vår förståelse av stjärnfysik.\n\nFotosfären, eller solens synliga "yta", markerar det lägsta lagret av solens atmosfär. Detta relativt tunna lager (cirka 500 kilometer tjockt) har en temperatur på omkring 5 500°C (10 000°F) och är där det mesta av solens synliga ljus härstammar från. Fotosfärens granulära utseende avslöjar konvektionsceller där het plasma stiger, kyls och sjunker tillbaka.\n\nOvanför fotosfären ligger kromosfären, ett lager på cirka 2 000 kilometer som framträder som en tunn röd kant under totala solförmörkelser. Mot normalt förväntat, stiger temperaturen faktiskt genom kromosfären och når cirka 20 000°C vid dess övre gräns. Denna temperaturinversion representerar ett av de pågående mysterierna inom solfysiken.\n\n## Den Mystiska Koronan\nDet yttersta lagret av solens atmosfär är koronan, en tunn men extremt het region som sträcker sig miljontals kilometer ut i rymden. Med temperaturer som överstiger 1 miljon grader Celsius, är koronan mystiskt hundratals gånger varmare än lagren nedanför—ett fenomen känt som koronal uppvärmningsproblemet.\n\nKoronan är normalt osynlig på grund av fotosfärens överväldigande ljusstyrka, men blir spektakulärt synlig under totala solförmörkelser som en pärlvitt halo runt den mörklagda solen. Rymdbaserade instrument med koronografer, som blockerar solens skiva, tillåter forskare att studera koronan kontinuerligt. Koronan har ingen bestämd yttergräns och övergår gradvis till solvinden som fyller heliosfären.\n\n',
        tenant: { lookupApiKey: tenants.sun.apiKey }
      }
    ],
    // All tenants get file area and color-coded tags for testing purposes
    tags: tenantApiKeys.flatMap((lookupApiKey) => [
      {
        name: 'Indigo',
        slug: 'indigo',
        brand: { color: 'indigo-500', icon: 'TagIcon' },
        tenant: { lookupApiKey }
      },
      {
        name: 'Orange',
        slug: 'orange',
        brand: { color: 'orange-500', icon: 'TagIcon' },
        tenant: { lookupApiKey }
      },
      {
        name: 'Teal',
        slug: 'teal',
        brand: { color: 'teal-500', icon: 'TagIcon' },
        tenant: { lookupApiKey }
      },
      {
        name: 'File area',
        slug: 'file-area',
        brand: { color: 'green-500', icon: 'EyeIcon' },
        tenant: { lookupApiKey }
      }
    ]),
    tenants: [
      {
        name: 'cdwr.io',
        slug: tenantSlug.cdwrIo,
        description: 'cdwr platform showcase.',
        locale: 'en',
        supportedLocales: ['en'],
        apiKey: tenants.cdwrIo.apiKey
      },
      {
        name: 'Moon',
        slug: tenantSlug.moon,
        // Matches `TENANT_ID=moon`, which development runs tenant mode as
        deployment: 'moon',
        description:
          'A moon is a natural satellite that orbits a planet or other celestial body larger than itself.',
        locale: 'en',
        supportedLocales: ['en', 'sv'],
        apiKey: tenants.moon.apiKey
      },
      {
        name: 'Star',
        slug: tenantSlug.star,
        description:
          'A star is a luminous spherical celestial body composed primarily of hydrogen and helium gas that generates energy through nuclear fusion in its core.',
        locale: 'en',
        supportedLocales: ['en'],
        apiKey: tenants.star.apiKey
      },
      {
        name: 'Sun',
        slug: tenantSlug.sun,
        description:
          'Solen är den centrala stjärnan i ett planetsystem, runt vilken planeter, månar, asteroider och andra himlakroppar kretsar.',
        locale: 'sv',
        supportedLocales: ['sv'],
        apiKey: tenants.sun.apiKey
      }
    ],
    tours: [
      {
        title: 'Sea of Tranquility Expedition',
        slug: 'sea-of-tranquility-expedition',
        summary:
          'Seven days along the Apollo 11 landing site, from the first bootprint to the far side sunrise.',
        destination: 'Mare Tranquillitatis, Moon',
        duration: '7 days',
        price: 2400,
        currency: 'EUR',
        departureDate: '2027-04-12',
        bookingDeadline: '2027-02-12',
        heroImage: 'stock-rivervalley-1.jpg',
        intent: 'booking' as const,
        included: [
          'All transfers from the orbital station',
          'Seven nights at base camp, full board',
          'Suit rental',
          'Certified guide throughout'
        ],
        notIncluded: ['Orbital transfer from Earth', 'Personal insurance'],
        itinerary: [
          {
            places: ['Tranquility Base Camp'],
            title: 'Arrival & welcome dinner',
            description:
              'Landing at the base camp, gear check and a first look at the mare through the observation dome.'
          },
          {
            title: 'The landing site',
            description:
              'A slow walk to the Apollo 11 site, keeping the safe distance the preservation rules require.'
          },
          {
            places: ['Hypatia Rille Station'],
            title: 'Regolith and rilles',
            description:
              'Field geology along Hypatia Rille with a guide who has spent a decade mapping it.'
          },
          {
            title: 'Earthrise',
            description:
              'An early start for the full Earth over the eastern rim, followed by a long breakfast.'
          },
          {
            title: 'Free day',
            description:
              'Rest, read, or join the optional traverse to the neighbouring crater field.'
          },
          {
            title: 'Far side crossing',
            description:
              'The quiet side, radio silence and the darkest sky any of us will ever stand under.'
          },
          {
            title: 'Departure',
            description: 'Final briefing, group photo and the ride home.'
          }
        ],
        content:
          "## What's included\nAll transfers from the orbital station, seven nights at base camp, full board, suit rental and a certified guide throughout.\n\n## Good to know\nGroups are capped at eight travellers. A basic fitness check is required no later than four weeks before departure.\n",
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        title: 'Lunar South Pole Ice Walk',
        slug: 'lunar-south-pole-ice-walk',
        summary:
          'Four days in permanent shadow, hunting water ice with the team that found it.',
        destination: 'Shackleton Crater, Moon',
        duration: '4 days',
        price: 1800,
        currency: 'EUR',
        departureNote: 'Summer 2027 — dates to be confirmed',
        heroImage: 'stock-terraces-1.jpg',
        intent: 'interest' as const,
        included: [
          'Four nights, all meals',
          'Thermal suit rental',
          'Lab access with the survey team'
        ],
        notIncluded: ['Orbital transfer from Earth', 'Personal insurance'],
        itinerary: [
          {
            title: 'Into the shadow',
            description:
              'Descent to the crater floor and an introduction to cold-trap science.'
          },
          {
            places: ['Shackleton Ice Lab'],
            title: 'Sampling day',
            description:
              'Hands-on coring alongside the survey team, with lab time in the afternoon.'
          },
          {
            title: 'Peak of eternal light',
            description:
              'Up to the rim where the sun never quite sets, and the solar array that powers it all.'
          },
          {
            title: 'Departure',
            description: 'A last look down into the dark, then home.'
          }
        ],
        content:
          "## What's included\nFour nights, all meals, thermal suit rental and every instrument you will get your hands on.\n\n## Good to know\nTemperatures on the crater floor stay below -150°C. The walking is easy but the cold is not.\n",
        tenant: { lookupApiKey: tenants.moon.apiKey }
      },
      {
        title: 'Atacama Dark Sky Week',
        slug: 'atacama-dark-sky-week',
        summary:
          'Six nights under the clearest sky on Earth, with a telescope of your own every night.',
        destination: 'Atacama Desert, Chile',
        duration: '6 days',
        price: 2100,
        currency: 'EUR',
        departureDate: '2027-03-08',
        bookingDeadline: '2027-01-08',
        heroImage: 'stock-village-1.jpg',
        intent: 'booking' as const,
        included: [
          'Six nights in the valley',
          'Breakfasts and dinners',
          'Telescope hire',
          'Nightly guiding'
        ],
        notIncluded: ['Flights to Calama', 'Lunches'],
        itinerary: [
          {
            places: ['Cerro Paranal Lodge'],
            title: 'Arrival in San Pedro',
            description:
              'Settling in at altitude, an early night before the first observing session.'
          },
          {
            title: 'First light',
            description:
              'Learning the instrument, then the Magellanic Clouds until the small hours.'
          },
          {
            title: 'Deep sky',
            description:
              'Globular clusters and a guided tour of the southern Milky Way.'
          },
          {
            places: ['Atacama Array'],
            title: 'Observatory visit',
            description:
              'A daytime visit to the professional array on the plateau above the valley.'
          },
          {
            title: 'Astrophotography',
            description:
              'Stacking, tracking and processing, with your own frames from the week.'
          },
          {
            title: 'Departure',
            description: 'Late breakfast and transfer to Calama.'
          }
        ],
        content:
          "## What's included\nSix nights in the valley, all breakfasts and dinners, telescope hire and nightly guiding.\n\n## Good to know\nThe site sits at 2,400 metres. Take the first day slowly.\n",
        tenant: { lookupApiKey: tenants.star.apiKey }
      },
      {
        title: 'Solförmörkelsejakten',
        slug: 'solformorkelsejakten',
        summary:
          'Fem dagar längs totalitetsstråket, med de bästa platserna bokade i förväg.',
        destination: 'Kiruna, Sverige',
        duration: '5 dagar',
        price: 1600,
        currency: 'SEK',
        departureDate: '2027-08-16',
        bookingDeadline: '2027-06-16',
        heroImage: 'stock-vinerows-2.jpg',
        intent: 'booking' as const,
        included: [
          'Fyra nätter med frukost',
          'Solfilter',
          'Transfer till observationsplatsen'
        ],
        notIncluded: ['Flyg till Kiruna', 'Luncher och middagar'],
        itinerary: [
          {
            places: ['Abisko Fjällstation'],
            title: 'Ankomst och genomgång',
            description:
              'Incheckning, utdelning av solfilter och en genomgång av veckans väderprognoser.'
          },
          {
            places: ['Solobservatoriet'],
            title: 'Solfläckar på dagtid',
            description:
              'Observation i vitt ljus och H-alfa från terrassen, om molnen tillåter.'
          },
          {
            title: 'Förmörkelsedagen',
            description:
              'Tidig avfärd till observationsplatsen. Totaliteten varar i två minuter och tolv sekunder.'
          },
          {
            title: 'Norrsken',
            description:
              'Kvällstur norrut när solaktiviteten ger utdelning även efter mörkrets inbrott.'
          },
          {
            title: 'Hemresa',
            description: 'Frukost, bildvisning och transfer till flygplatsen.'
          }
        ],
        content:
          '## Det här ingår\nFyra nätter, alla frukostar, solfilter och transfer till observationsplatsen.\n\n## Bra att veta\nGruppen är begränsad till tolv resenärer. Klä dig varmt, det blir kallt i skuggan.\n',
        tenant: { lookupApiKey: tenants.sun.apiKey }
      }
    ],
    users: [
      {
        name: 'System User',
        description: 'Access to manage the whole system',
        email: 'system@local.dev',
        password: '',
        role: 'system-user',
        locale: 'en',
        tenants: []
      },
      {
        name: 'Black Hole',
        description: 'Admin access to all workspaces',
        email: 'black@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [
          {
            lookupApiKey: tenants.star.apiKey,
            role: 'admin'
          },
          {
            lookupApiKey: tenants.moon.apiKey,
            role: 'admin'
          },
          {
            lookupApiKey: tenants.sun.apiKey,
            role: 'admin'
          }
        ]
      },
      {
        name: 'Space Station',
        description: 'User access to all workspaces',
        email: 'iss@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [
          {
            lookupApiKey: tenants.star.apiKey,
            role: 'user'
          },
          {
            lookupApiKey: tenants.moon.apiKey,
            role: 'user'
          },
          { lookupApiKey: tenants.sun.apiKey, role: 'user' }
        ]
      },
      {
        name: 'Antares Star',
        description: 'Administrator access to Star',
        email: 'antares@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [
          {
            lookupApiKey: tenants.star.apiKey,
            role: 'admin'
          }
        ]
      },
      {
        name: 'Vega Star',
        description: 'User access to Star',
        email: 'vega@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [{ lookupApiKey: tenants.star.apiKey, role: 'user' }]
      },
      {
        name: 'Titan Moon',
        description: 'Administrator access to Moon',
        email: 'titan@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [
          {
            lookupApiKey: tenants.moon.apiKey,
            role: 'admin'
          }
        ]
      },
      {
        name: 'Luna Moon',
        description: 'Reads members-only content on Moon, no admin access',
        email: 'luna@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [
          { lookupApiKey: tenants.moon.apiKey, role: 'reader' as const }
        ]
      },
      {
        name: 'Phobos Moon',
        description: 'User access to Moon',
        email: 'phobos@local.dev',
        password: '',
        role: 'user',
        locale: 'en',
        tenants: [{ lookupApiKey: tenants.moon.apiKey, role: 'user' }]
      },
      {
        name: 'Rigel Sun',
        description: 'Administratör för Sun',
        email: 'rigel@local.dev',
        password: '',
        role: 'user',
        locale: 'sv',
        tenants: [
          {
            lookupApiKey: tenants.sun.apiKey,
            role: 'admin'
          }
        ]
      },
      {
        name: 'Ross Sun',
        description: 'Användare med åtkomst till Sun',
        email: 'ross@local.dev',
        password: '',
        role: 'user',
        locale: 'sv',
        tenants: [{ lookupApiKey: tenants.sun.apiKey, role: 'user' }]
      }
    ]
  };
};
