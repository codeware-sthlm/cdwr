import type { SiteDefinition } from '../site-definition';

import { moonMetricCardSource } from './moon-components';
import {
  moonCalloutIllustration,
  moonFeatureIllustration,
  moonHeroIllustration
} from './moon-illustrations';

/**
 * The Moon workspace: the seeded test tenant with every block and collection,
 * for trying a feature locally or in a pull request's preview.
 *
 * The e2e suite asserts on its content, so change what exists deliberately.
 * The abstract images are file-area fixtures; the pictures are illustrations.
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

  customComponents: [
    {
      name: 'Metric card',
      slug: 'metric-card',
      source: moonMetricCardSource,
      propsSchema: [
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'text' },
        { name: 'values', type: 'textarea', required: true },
        { name: 'unit', type: 'text' },
        { name: 'decimals', type: 'number' },
        { name: 'showChart', type: 'checkbox' }
      ]
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
      filename: 'crater-field.png',
      external: true,
      alt: 'Craters lit by a low Sun, with long shadows across the lunar surface',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'earthrise.png',
      external: true,
      alt: 'Earth rising over the grey lunar horizon',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'moon-phases.png',
      external: true,
      alt: 'The eight phases of the Moon, from new to full, on an arc across the night sky',
      tags: [
        {
          lookupSlug: 'file-area'
        }
      ]
    },
    {
      filename: 'moon-landscape.png',
      external: true,
      alt: 'The Moon rising over dark hills, beside a small observatory dome'
    },
    {
      filename: 'observing-night.png',
      external: true,
      alt: 'A telescope aimed at a crescent Moon, a lantern lighting a star chart'
    },
    {
      filename: 'astronomer-avatar.png',
      external: true,
      alt: 'An illustrated portrait of a smiling observer in a knit hat'
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

  places: [
    {
      name: 'Tranquility Base Camp',
      kind: 'hotel',
      url: 'https://example.com/tranquility-base-camp',
      note: 'Eight cabins around a shared observation dome.'
    },
    {
      name: 'Hypatia Rille Station',
      kind: 'activity',
      url: 'https://example.com/hypatia-rille',
      note: 'Field geology outpost on the eastern rille.'
    },
    {
      name: 'Shackleton Ice Lab',
      kind: 'activity',
      url: 'https://example.com/shackleton-ice-lab',
      note: 'Working survey lab on the crater floor.'
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
      heroImage: { lookupFilename: 'stock-rivervalley-1.jpg' },
      intent: 'booking',
      included: [
        'All transfers from the orbital station',
        'Seven nights at base camp, full board',
        'Suit rental',
        'Certified guide throughout'
      ],
      notIncluded: ['Orbital transfer from Earth', 'Personal insurance'],
      itinerary: [
        {
          places: [{ lookupName: 'Tranquility Base Camp' }],
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
          places: [{ lookupName: 'Hypatia Rille Station' }],
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
        "## What's included\nAll transfers from the orbital station, seven nights at base camp, full board, suit rental and a certified guide throughout.\n\n## Good to know\nGroups are capped at eight travellers. A basic fitness check is required no later than four weeks before departure.\n"
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
      heroImage: { lookupFilename: 'stock-terraces-1.jpg' },
      intent: 'interest',
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
          places: [{ lookupName: 'Shackleton Ice Lab' }],
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
        "## What's included\nFour nights, all meals, thermal suit rental and every instrument you will get your hands on.\n\n## Good to know\nTemperatures on the crater floor stay below -150°C. The walking is easy but the cold is not.\n"
    }
  ],

  reusableContent: [
    {
      title: 'Observing checklist',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Observing checklist\n- Check the forecast and moonrise time.\n- Let your eyes adjust to the dark for at least fifteen minutes.\n- Note the phase, and which mare or crater you are aiming at.\n- Keep a red light on hand: it does not undo the adjustment.\n'
              }
            }
          ]
        },
        {
          blockType: 'image',
          media: { lookupFilename: 'observing-night.png' }
        }
      ]
    }
  ],

  pages: [
    {
      name: 'Home',
      slug: 'home',
      layout: [
        {
          blockType: 'hero',
          illustration: moonHeroIllustration,
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
                url: '/about',
                label: 'About Moon',
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
              title: 'Guided Tours',
              description:
                'Small-group tours through mission control and the kit that makes a night under the Moon worthwhile.'
            },
            {
              brand: {
                icon: 'MoonIcon',
                color: 'yellow-300'
              },
              title: 'Mission Control',
              description:
                'The people and tools behind Moon, from a backyard telescope to a published star chart.'
            }
          ]
        },
        {
          blockType: 'callout',
          illustration: moonCalloutIllustration,
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
      name: 'About',
      slug: 'about',
      header: 'The people and tools behind Moon',
      layout: [
        {
          blockType: 'about',
          heading: 'Mission control'
        },
        {
          blockType: 'custom-component',
          component: { lookupSlug: 'metric-card' },
          props: {
            title: 'Visitors per week',
            description: 'Seven weeks of lunar enthusiasm',
            values: '12, 15, 14, 19, 23, 21, 28',
            unit: '',
            decimals: 0,
            showChart: true
          }
        },
        {
          blockType: 'image',
          media: { lookupFilename: 'moon-landscape.png' }
        },
        {
          blockType: 'testimonial',
          quote:
            'Watching the terminator crawl across Tycho at two in the morning made the whole late night worth it.',
          author: {
            name: 'M. Ridley',
            role: 'Amateur astronomer',
            avatar: { lookupFilename: 'astronomer-avatar.png' }
          },
          enableLink: true,
          link: {
            type: 'custom',
            url: '/tours',
            label: 'Book a tour',
            newTab: false
          }
        },
        {
          blockType: 'social-media',
          direction: 'horizontal',
          social: [
            {
              platform: 'github',
              url: 'https://github.com/codeware-sthlm'
            },
            {
              platform: 'email',
              email: 'hello@moon.dev'
            }
          ]
        },
        {
          blockType: 'pill-list',
          eyebrow: 'Kit bag',
          heading: 'What fits in a backpack',
          intro: 'Nothing exotic — the list itself is the point.',
          items: [
            { label: '8" Dobsonian' },
            { label: 'Moon filter' },
            { label: '2x Barlow' },
            { label: 'Red headlamp' },
            { label: 'Star chart' }
          ]
        },
        {
          blockType: 'spacing',
          size: 'loose',
          divider: true
        },
        {
          blockType: 'feature-section',
          eyebrow: 'Observatory',
          heading: 'Set up for a night under the Moon',
          illustration: moonFeatureIllustration,
          intro:
            'A steady mount, dark-adapted eyes and fifteen minutes of patience turn a bright disc into a landscape of maria and craters.',
          subFeatures: [
            {
              title: 'Pick your window',
              body: 'A few nights either side of first or last quarter throw the longest shadows across the terminator, where craters read best.'
            },
            {
              title: 'Protect your night vision',
              body: 'A red light keeps your eyes adjusted between glances at a star chart.'
            },
            {
              title: 'Start wide, then zoom in',
              body: 'Find a mare with the naked eye, then let a telescope take you to the crater at its edge.'
            }
          ]
        },
        {
          blockType: 'showcase',
          eyebrow: 'Missions',
          heading: 'Human and robotic visits',
          intro:
            'A short list of missions that shaped what we know, each pointing to more on this site.',
          items: [
            {
              tag: 'Human landing',
              title: 'Apollo 11',
              description:
                'The first crewed landing, touching down in Mare Tranquillitatis in July 1969 and returning the samples that dated the maria.',
              meta: '1969 · Mare Tranquillitatis',
              link: {
                type: 'custom',
                url: '/lunar-maria',
                label: 'Read about the maria',
                newTab: false
              }
            },
            {
              tag: 'Uncrewed orbiter',
              title: 'LADEE',
              description:
                "Measured the Moon's thin exosphere and the dust it carries, in orbit through the winter of 2013 and 2014.",
              meta: '2013 · Lunar orbit',
              link: {
                type: 'custom',
                url: '/blocks',
                label: 'See every block',
                newTab: false
              }
            },
            {
              tag: 'Ongoing program',
              title: 'Artemis',
              description:
                'Aims to return astronauts to the lunar south pole, where permanently shadowed craters are thought to hold water ice.',
              meta: 'Ongoing · South pole',
              link: {
                type: 'custom',
                url: '/studio',
                label: 'Try the theme studio',
                newTab: false
              }
            },
            {
              tag: 'Downloads',
              title: 'Mission archive',
              description:
                'Maps, pictures and papers from the missions above, ready to download and keep.',
              meta: 'Files · Maps and papers',
              link: {
                type: 'custom',
                url: '/file-area',
                label: 'Open the archive',
                newTab: false
              }
            }
          ]
        },
        {
          blockType: 'card',
          cards: [
            {
              brand: { icon: 'EyeIcon', color: 'sky-500' },
              title: 'Naked eye',
              description: 'Start here.',
              content:
                'Maria and the brightest crater rays are visible without any equipment at all.'
            },
            {
              brand: { icon: 'MapIcon', color: 'indigo-500' },
              title: 'Binoculars',
              description: 'The easiest upgrade.',
              content:
                "A steady pair resolves Tycho's ray system and the shadowed floors of the largest craters."
            },
            {
              brand: { icon: 'CogIcon', color: 'teal-500' },
              title: 'Telescope',
              description: 'For the terminator.',
              content:
                'A small scope on a tripod turns the line between day and night into a landscape of peaks and shadows.'
            }
          ]
        },
        {
          blockType: 'code',
          language: 'ts',
          code: "type Observation = {\n  date: string;\n  phase: 'new' | 'crescent' | 'quarter' | 'gibbous' | 'full';\n  target: string; // e.g. 'Tycho', 'Mare Imbrium'\n  notes: string;\n};"
        },
        {
          blockType: 'reusable-content',
          reusableContent: { lookupTitle: 'Observing checklist' }
        }
      ]
    },
    {
      name: 'Blocks',
      slug: 'blocks',
      header: 'Every block, live',
      layout: [
        {
          blockType: 'block-gallery',
          eyebrow: 'Every block',
          heading: 'Every block Moon renders',
          intro:
            'The production component for each one, drawing from the same content API this site uses.',
          mode: 'index'
        }
      ]
    },
    {
      name: 'Studio',
      slug: 'studio',
      header: 'Theme studio',
      layout: [
        {
          blockType: 'theme-studio',
          eyebrow: 'Try it',
          heading: 'A theme you cannot save until it is readable',
          intro: 'Pick a brand colour and the studio derives the rest.',
          startFrom: 'frost',
          note: 'Live — the studio itself, not a screenshot of it.'
        }
      ]
    }
  ],

  // `seed.ts` navigated every page but home; `customSeed` appended the
  // listings with their own labels. Both are ordinary content.
  //
  // Exactly five items, so the header never overflows into the "Menu"
  // collapse on desktop
  navigation: [
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'lunar-maria'
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
        lookupSlug: 'about'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'moon-members'
      },
      label: 'Members'
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
