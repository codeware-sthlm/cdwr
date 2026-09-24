import type { SiteDefinition } from '../site-definition';

/**
 * The Moon workspace, as it is seeded in development.
 *
 * Transcribed from `seed.development.ts` rather than invented, so what a
 * developer sees after `nx re-seed cms` does not change with this format.
 */

export const moon: SiteDefinition = {
  name: 'moon',
  description: 'The Moon workspace seeded in development',

  // Was built imperatively by `customSeed`, for every tenant. It is ordinary
  // content, so it is stated here instead
  forms: [
    {
      title: 'Contact',
      emailLabel: 'Your email',
      emailPlaceholder: 'you@example.com',
      submitLabel: 'Reach out',
      confirmation: 'Thanks! We will get back to you shortly.',
      subject: 'New message from {{email}}',
      emailTo: 'hello@moon.dev'
    }
  ],

  tags: [
    {
      name: 'Indigo',
      slug: 'indigo',
      brand: { color: 'indigo-500', icon: 'TagIcon' }
    },
    {
      name: 'Orange',
      slug: 'orange',
      brand: { color: 'orange-500', icon: 'TagIcon' }
    },
    {
      name: 'Teal',
      slug: 'teal',
      brand: { color: 'teal-500', icon: 'TagIcon' }
    },
    {
      name: 'File area',
      slug: 'file-area',
      brand: { color: 'green-500', icon: 'EyeIcon' }
    }
  ],

  categories: [
    {
      name: 'Lunar Features',
      slug: 'lunar-features'
    },
    {
      name: 'Moon Phases',
      slug: 'moon-phases'
    },
    {
      name: 'Planetary Moons',
      slug: 'planetary-moons'
    }
  ],

  media: [
    {
      filename: 'abstract-image-1.jpg',
      external: true,
      alt: 'Abstract image 1',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'abstract-image-2.jpg',
      external: true,
      alt: 'Abstract image 2',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'abstract-image-3.jpg',
      external: true,
      alt: 'Abstract image 3',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'data-1.json',
      external: true,
      alt: 'Data 1',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'data-2.json',
      external: true,
      alt: 'Data 2',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'document-1.pdf',
      external: true,
      alt: 'Document 1',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'document-2.pdf',
      external: true,
      alt: 'Document 2',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'text-1.txt',
      external: true,
      alt: 'Text 1',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'text-2.txt',
      external: true,
      alt: 'Text 2',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'word-1.docx',
      external: true,
      alt: 'Word 1',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'word-2.docx',
      external: true,
      alt: 'Word 2',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    }
  ],

  pages: [
    {
      name: 'Posts',
      slug: 'posts',
      layout: [
        {
          blockType: 'posts',
          title: 'Articles',
          description: 'Thoughts on programming, product design, and more.',
          limit: 10
        }
      ]
    },
    {
      name: 'Tours',
      slug: 'tours',
      layout: [
        {
          blockType: 'tours',
          title: 'Tours',
          description: 'Guided tours in small groups, with big flavours.',
          limit: 10
        }
      ]
    },
    {
      name: 'File area',
      slug: 'file-area',
      header: 'File area',
      layout: [
        {
          blockType: 'file-area',
          tags: [{ lookupSlug: 'file-area' }],
          files: null
        }
      ]
    },
    {
      name: 'Moon Members',
      slug: 'moon-members',
      header: 'For members of the Moon workspace',
      visibility: 'members',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Members only 🔒\nThis page is restricted to signed-in members of the Moon workspace. The public site must never render it, and a member of another workspace must not see it either.\n'
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Lunar Maria',
      slug: 'lunar-maria',
      header: 'The Dark Plains of the Moon',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  "## Lunar Maria 🌑\nLunar maria are the dark, basaltic plains on the Moon formed by ancient volcanic eruptions.\n### Formation and Characteristics\nThe term \"maria\" (Latin for \"seas\") dates back to early astronomers who mistook these dark regions for actual bodies of water. We now know they are vast solidified flows of basaltic lava that erupted billions of years ago.\n\nLunar maria cover about 16% of the Moon's surface, primarily on the near side. The most prominent maria include Mare Imbrium (Sea of Rains), Mare Serenitatis (Sea of Serenity), and Mare Tranquillitatis (Sea of Tranquility) - where humans first landed during the Apollo 11 mission.\n\nThese dark plains formed between 3 and 3.5 billion years ago when molten magma from the Moon's interior flooded large impact basins. The maria are significantly younger than the lighter, heavily cratered highland regions that make up most of the lunar surface.\n\nThe maria contain fewer craters than the highlands because they formed later in the Moon's history, after the heaviest period of meteorite bombardment. They also contain higher concentrations of iron-rich minerals, which gives them their darker appearance.\n\nSamples returned by Apollo astronauts revealed that maria basalts differ in composition from Earth's volcanic rocks, providing important clues about the Moon's formation and evolution.\n"
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Lunar Craters',
      slug: 'lunar-craters',
      header: 'Impact Features on the Moon',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Lunar Craters 🌕\nLunar craters are bowl-shaped depressions formed by meteoroid impacts on the Moon\'s surface.\n### Formation and Significance\nWithout atmospheric protection, the Moon has preserved a record of impacts spanning more than 4 billion years. The largest lunar craters exceed 200 kilometers in diameter, while the smallest are microscopic. This preserved impact history makes the Moon an invaluable cosmic time capsule.\n\nCraters typically feature a raised rim, an interior bowl, and sometimes a central peak formed when the surface rebounded after impact. Larger impacts can create complex crater structures with terraced walls and multiple peaks.\n\nSome of the most prominent lunar craters include Tycho, with its distinctive ray system of ejected material stretching hundreds of kilometers; Copernicus, often called the "Monarch of the Moon"; and Clavius, one of the largest craters visible from Earth.\n\nThe distribution and density of craters in different regions help scientists determine the relative ages of lunar surfaces. Heavily cratered areas are generally older, having been exposed to impacts for a longer period. This principle was crucial in understanding the Moon\'s geological history.\n\nLunar craters are named after notable scientists, philosophers, and explorers. This naming convention, established by the International Astronomical Union, honors figures like Copernicus, Kepler, and Aristotle.\n'
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Lunar Phases',
      slug: 'lunar-phases',
      header: 'The Changing Face of the Moon',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Lunar Phases 🌓\nLunar phases are the different appearances of the Moon as seen from Earth during its monthly orbit.\n### The Lunar Cycle\nThe Moon completes a full cycle of phases approximately every 29.5 days, a period known as a synodic month. This cycle begins with the New Moon (when the Moon is between Earth and the Sun), proceeds through waxing phases as more of the illuminated side becomes visible, reaches Full Moon (when the Moon and Sun are on opposite sides of Earth), and then wanes until returning to New Moon.\n\nThe primary phases in order are: New Moon, Waxing Crescent, First Quarter, Waxing Gibbous, Full Moon, Waning Gibbous, Last Quarter, and Waning Crescent. At First and Last Quarter phases, exactly half of the Moon\'s visible face is illuminated.\n\nLunar phases occur because the Moon orbits Earth while both bodies orbit the Sun. As the Moon moves around Earth, the angle between the Sun, Moon, and Earth changes, altering which portion of the Moon\'s sunlit side is visible from our perspective.\n\nThe Moon always presents approximately the same face toward Earth due to tidal locking. This synchronous rotation means that the Moon\'s rotation period matches its orbital period around Earth, resulting in one side (the near side) always facing us, while the far side remains hidden from direct view.\n\nThroughout history, lunar phases have been used to track time, with many calendars based on the lunar cycle. The words "month" and "moon" share etymological roots in many languages, reflecting this ancient connection.\n'
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Home',
      slug: 'home',
      layout: [
        {
          blockType: 'hero',
          badge: 'Moon',
          heading: 'Look at the silver moon.',
          lede: 'A natural satellite that orbits a planet or other celestial body larger than itself.',
          actions: [
            {
              link: {
                type: 'custom',
                url: '/lunar-maria',
                label: 'Explore',
                newTab: false
              },
              emphasis: 'primary'
            },
            {
              link: {
                type: 'custom',
                url: '/lunar-craters',
                label: 'Lunar Craters',
                newTab: false
              },
              emphasis: 'secondary'
            }
          ]
        },
        {
          blockType: 'feature-cards',
          eyebrow: 'Discover',
          heading: 'The Moon Up Close',
          intro:
            "From dark volcanic plains to ancient craters, explore the many faces of Earth's closest celestial neighbour.",
          columns: '3',
          items: [
            {
              brand: {
                icon: 'GlobeAltIcon',
                color: 'stone-500'
              },
              title: 'Lunar Maria',
              description:
                'Dark basaltic plains formed by volcanic eruptions that flooded ancient impact basins.'
            },
            {
              brand: {
                icon: 'MapPinIcon',
                color: 'gray-400'
              },
              title: 'Lunar Craters',
              description:
                'Bowl-shaped depressions preserving over 4 billion years of impact history.'
            },
            {
              brand: {
                icon: 'MoonIcon',
                color: 'yellow-300'
              },
              title: 'Lunar Phases',
              description:
                'The changing appearance of the Moon during its monthly orbit around Earth.'
            }
          ]
        },
        {
          blockType: 'callout',
          showMark: true,
          heading: 'Fascinated by the Moon?',
          body: 'Learn more about lunar geology, atmosphere and the history of lunar exploration.',
          link: {
            type: 'custom',
            url: '/lunar-maria',
            label: 'Read articles',
            newTab: false
          }
        },
        {
          blockType: 'form',
          form: { lookupTitle: 'Contact' },
          enableIntro: true,
          introContent: {
            markdown:
              '## Curious? Reach out.\n\nOne field, nothing more. Leave your email and we will take it from there.'
          }
        }
      ]
    }
  ],

  // `seed.ts` navigated every page but home; `customSeed` appended the
  // listings with their own labels. Both are ordinary content
  navigation: [
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'moon-members'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'lunar-maria'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'lunar-craters'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'lunar-phases'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'posts'
      },
      label: 'Articles'
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'tours'
      },
      label: 'Tours'
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'file-area'
      },
      label: 'File area'
    }
  ],

  posts: [
    {
      title: 'Lunar Highlands',
      slug: 'lunar-highlands',
      content:
        "# Lunar Highlands\nThe lunar highlands are the light-colored, heavily cratered regions that make up approximately 83% of the Moon's surface. These ancient terrains provide a window into the early history of our solar system, preserving a record of the intense meteorite bombardment that occurred over 4 billion years ago.\n\nUnlike the darker lunar maria, the highlands consist primarily of anorthosite, a rock composed largely of the mineral plagioclase feldspar. This composition gives the highlands their characteristic bright appearance when viewed from Earth.\n\nThe highlands represent the Moon's original crust, formed when lighter minerals floated to the surface of a molten lunar magma ocean shortly after the Moon's formation. This crust solidified around 4.5 billion years ago, making the highlands some of the oldest accessible surfaces in our solar system.\n\n## Scientific Significance\nThe heavily cratered nature of the highlands provides crucial information about the early bombardment history of the inner solar system. This period, known as the Late Heavy Bombardment, affected all inner planets, but Earth's active geology has erased most evidence of this violent epoch.\n\nApollo 16 was the only mission to land specifically in the lunar highlands, collecting samples that revealed the anorthositic composition of these regions. These samples have been crucial for understanding the Moon's formation and early evolution, suggesting that the Moon likely formed from debris ejected when a Mars-sized body collided with the early Earth.\n\n",
      createdAt: '2026-10-01',
      authors: [
        {
          lookupEmail: 'titan@local.dev'
        }
      ],
      categories: [
        {
          lookupSlug: 'lunar-features'
        }
      ]
    },
    {
      title: 'The Lunar Atmosphere',
      slug: 'the-lunar-atmosphere',
      content:
        "# The Lunar Atmosphere\nContrary to popular belief, the Moon does have an atmosphere, albeit an extremely tenuous one. This \"exosphere\" is so thin that its molecules rarely collide with each other, making it fundamentally different from the atmospheres of Earth or Mars.\n\nThe lunar atmosphere contains several elements including helium, argon, neon, sodium, and potassium, with a total mass of only about 10 metric tons spread across the entire Moon. By comparison, Earth's atmosphere has a mass of about 5 quadrillion metric tons.\n\nSeveral sources contribute to this tenuous atmosphere: solar wind particles captured by the Moon's weak gravitational field, outgassing from the lunar interior, and material vaporized by micrometeorite impacts. The composition varies with the lunar day/night cycle and is influenced by solar activity.\n\n## Scientific Interest\nStudying the lunar atmosphere helps scientists understand surface-exosphere interactions on airless bodies throughout the solar system. The Lunar Atmosphere and Dust Environment Explorer (LADEE) mission, which orbited the Moon in 2013-2014, made detailed measurements of this exosphere's composition and density variations.\n\nThe Moon's near-vacuum environment makes it an excellent location for certain types of astronomical observations. Without atmospheric distortion, telescopes placed on the lunar surface could achieve exceptional clarity, particularly on the far side where they would also be shielded from Earth's radio emissions.\n\n",
      createdAt: '2026-10-15',
      authors: [
        {
          lookupEmail: 'titan@local.dev'
        }
      ],
      categories: [
        {
          lookupSlug: 'lunar-features'
        }
      ]
    },
    {
      title: 'Lunar Water',
      slug: 'lunar-water',
      content:
        "# Lunar Water\nFor decades, scientists believed the Moon was completely dry. This view changed dramatically in recent years as multiple missions detected the presence of water on our celestial neighbor, a discovery with profound implications for lunar science and future human exploration.\n\nWater exists on the Moon in multiple forms. Water ice is concentrated in permanently shadowed craters near the lunar poles where temperatures remain below -158°C (-250°F), cold enough to trap water molecules for billions of years. Additionally, hydration has been detected in the lunar regolith (soil) across the surface, likely in the form of hydroxyl groups (OH) bonded to minerals.\n\nThe lunar water likely comes from multiple sources: cometary impacts, interaction between the solar wind and oxygen-bearing minerals in the lunar soil, and possibly primordial water trapped during the Moon's formation. Understanding these sources helps reveal the Moon's history and evolution.\n\n## Importance for Exploration\nWater is a precious resource for space exploration. It can be split into hydrogen and oxygen for rocket fuel or life support systems, and of course, astronauts need it for drinking and other uses. The presence of accessible water could significantly reduce the mass that future missions need to launch from Earth.\n\nNASA's Artemis program, which aims to return humans to the Moon by the mid-2020s, plans to investigate lunar water resources and potentially demonstrate in-situ resource utilization technologies. The lunar south pole, with its relatively high concentration of water ice, has been selected as the target region for these missions precisely because of its potential water resources.\n\n",
      createdAt: '2026-09-06',
      authors: [
        {
          lookupEmail: 'phobos@local.dev'
        }
      ],
      categories: [
        {
          lookupSlug: 'lunar-features'
        }
      ]
    },
    {
      title: "The Moon's Formation",
      slug: 'the-moons-formation',
      content:
        "# The Moon's Formation\nThe origin of the Moon has fascinated humans since ancient times, but only in recent decades have scientists developed a compelling theory for its formation. The currently accepted model, known as the Giant Impact Hypothesis, suggests that about 4.5 billion years ago, a Mars-sized body (sometimes called Theia) collided with the proto-Earth.\n\nThis catastrophic impact ejected a vast amount of material from both the impactor and Earth's mantle into orbit around our planet. Within this debris disk, material began to coalesce, eventually forming the Moon. This violent birth explains several key observations about the Earth-Moon system.\n\nComputer simulations of the impact event closely match the current Earth-Moon system, including the Moon's relatively small iron core compared to Earth's. The hypothesis also accounts for the Moon's loss of volatile elements and explains why the Moon's orbit is in the same plane as Earth's equator.\n\n## Evidence for the Theory\nSamples returned by Apollo missions have been crucial in supporting the Giant Impact Theory. Moon rocks show isotopic compositions remarkably similar to Earth's mantle, suggesting a common origin, but they contain significantly less water and other volatile elements, consistent with the high-energy, high-temperature conditions of a giant impact.\n\nThe Moon's slightly elongated orbit and the fact that it's slowly receding from Earth (currently at a rate of about 3.8 centimeters per year) are also consistent with this formation model. Additionally, the Moon's density and internal structure—with a small core making up only about 20% of its volume compared to Earth's core at 30%—align with predictions of the impact hypothesis.\n\n",
      createdAt: '2026-10-20',
      authors: [
        {
          lookupEmail: 'phobos@local.dev'
        }
      ],
      categories: [
        {
          lookupSlug: 'planetary-moons'
        }
      ]
    }
  ]
};

export default moon;
