// This file is custom generated and should not be edited unless necessary.

import { capitalize } from '@codeware/shared/util/pure';

import { faqData } from './faq-data';
import { readMediaFiles, readStockMediaFiles } from './read-media-files';

const tenantSlug = {
  cdwrIo: 'cdwr-io',
  codeware: 'codeware',
  moon: 'moon',
  star: 'star'
} as const;

const tenants = {
  cdwrIo: { apiKey: '9d5316b1-0298-4113-904c-6cc10fcacb6c' },
  codeware: { apiKey: '81a86960-43e4-4e7d-ab4f-166c5c168183' },
  moon: { apiKey: 'b9c2fb25-df77-4304-a60a-028779a2cb37' },
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
          '## Red Giants 🔴\nRed giants are stars nearing the end of their lives, swollen to many times their original size as the hydrogen fuel in their core runs out.\n',
        slug: 'red-giants',
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
            }
          ]
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
          '# Supergiant Stars\nSupergiant stars are among the most massive and luminous stars known, many times larger than the Sun.\n',
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
        name: 'codeware.se',
        slug: tenantSlug.codeware,
        // Matches `TENANT_ID=codeware`, the id it has in Infisical and production
        deployment: 'codeware',
        description:
          'Konsultverksamheten — systemutveckling och teknisk ledning',
        locale: 'sv',
        supportedLocales: ['sv'],
        apiKey: tenants.codeware.apiKey
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
          }
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
      }
    ]
  };
};
