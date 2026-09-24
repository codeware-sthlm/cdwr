import type { SiteDefinition } from '../site-definition';

/**
 * The Star workspace, as it is seeded in development.
 *
 * Transcribed from `seed.development.ts` and `custom-seed.ts` rather than
 * invented, so what a developer sees after `nx re-seed cms` does not change
 * with this format.
 */

export const star: SiteDefinition = {
  name: 'star',
  description: 'The Star workspace seeded in development',

  forms: [
    {
      title: 'Contact',
      emailLabel: 'Your email',
      emailPlaceholder: 'you@example.com',
      submitLabel: 'Reach out',
      confirmation: 'Thanks! We will get back to you shortly.',
      subject: 'New message from {{email}}',
      emailTo: 'hello@star.dev'
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
      name: 'Star Types',
      slug: 'star-types'
    },
    {
      name: 'Star Clusters',
      slug: 'star-clusters'
    },
    {
      name: 'Stellar Evolution',
      slug: 'stellar-evolution'
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
          tags: [
            {
              lookupSlug: 'file-area'
            }
          ],
          files: null
        }
      ]
    },
    {
      name: 'Red Giants',
      slug: 'red-giants',
      header: 'Massive Stars in Their Late Stage',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  "## Red Giants 🔴\nRed giants are stars that have exhausted the hydrogen fuel in their cores and expanded to many times their original size.\n### Characteristics of Red Giants\nRed giants have cooler surface temperatures than main sequence stars, giving them their characteristic reddish color. Despite their lower surface temperature, they are extremely luminous due to their enormous size.\n\nBetelgeuse in the constellation Orion is one of the most famous red giants visible to the naked eye. Its diameter is so large that if placed at the center of our solar system, it would extend beyond the orbit of Mars.\n\nRed giants represent a relatively short phase in stellar evolution. Our own Sun will eventually become a red giant in about 5 billion years, expanding to engulf Mercury and Venus and possibly reaching Earth's orbit.\n\nThe expansion occurs when a star's core hydrogen is depleted, causing the core to contract and heat up while the outer layers expand and cool. This process significantly alters a star's properties in terms of temperature, luminosity, and size.\n\nAfter the red giant phase, intermediate-mass stars like our Sun will shed their outer layers to form a planetary nebula with a white dwarf at the center. More massive stars may continue to heavier elements fusion before ending as supernovae.\n"
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Binary Stars',
      slug: 'binary-stars',
      header: 'Stellar Systems with Two Stars',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Binary Stars ⭐⭐\nBinary star systems consist of two stars orbiting around their common center of mass.\n### Types of Binary Systems\nBinary stars are extremely common in our galaxy, with more than half of all Sun-like stars believed to exist in binary or multiple-star systems. They come in several varieties, including visual binaries (can be resolved through telescopes), spectroscopic binaries (detected through spectrum analysis), and eclipsing binaries (where stars pass in front of each other from our perspective).\n\nThe study of binary stars is crucial for determining stellar masses. By analyzing their orbital motions, astronomers can calculate the masses of the component stars with great precision - information that\'s difficult to obtain for isolated stars.\n\nBinary star systems can evolve in fascinating ways, especially when the stars have different masses. The more massive star will reach the giant phase first, potentially transferring material to its companion. This interaction can lead to novae, type Ia supernovae, and the formation of exotic objects like neutron stars and black holes.\n\nAlgol, also known as the "Demon Star," is a famous eclipsing binary in the Perseus constellation. Its brightness noticeably dims approximately every 2.87 days when the dimmer star passes in front of the brighter one from our perspective.\n\nSome binary systems contain a stellar remnant like a white dwarf, neutron star, or black hole, making them important laboratories for studying extreme physics.\n'
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Neutron Stars',
      slug: 'neutron-stars',
      header: 'Ultra-Dense Stellar Remnants',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Neutron Stars 🌟\nNeutron stars are the incredibly dense remnants of massive stars that have ended their lives in supernovae.\n### Properties of Neutron Stars\nNeutron stars are among the densest objects known in the universe. They pack roughly 1.4 solar masses into a sphere only about 20 kilometers in diameter. A teaspoon of neutron star material would weigh billions of tons on Earth.\n\nDespite their small size, neutron stars have extremely powerful magnetic fields, often trillions of times stronger than Earth\'s. They also rotate incredibly rapidly, with some completing multiple rotations per second. As they rotate, their magnetic fields sweep through space, creating beams of radiation that we can detect as pulses when they point toward Earth - these are known as pulsars.\n\nThe discovery of pulsars in 1967 by Jocelyn Bell Burnell was a landmark achievement in astronomy. Initially, the regular pulsations were so precise that they were briefly considered possible signals from alien civilizations, nicknamed "LGM" (Little Green Men).\n\nNeutron stars can exist in binary systems with ordinary stars, white dwarfs, or even other neutron stars. When a neutron star pulls material from a companion, it can create spectacular X-ray emissions and other high-energy phenomena.\n\nThe extreme conditions within neutron stars cannot be replicated in laboratories on Earth, making them unique cosmic laboratories for studying matter under extreme pressure and density.\n'
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
          badge: 'Star',
          heading: 'We are all made of stars.',
          lede: 'A luminous sphere of plasma, held together by gravity, generating energy through nuclear fusion at its core.',
          actions: [
            {
              link: {
                type: 'custom',
                url: '/red-giants',
                label: 'Explore',
                newTab: false
              },
              emphasis: 'primary'
            },
            {
              link: {
                type: 'custom',
                url: '/binary-stars',
                label: 'Binary Stars',
                newTab: false
              },
              emphasis: 'secondary'
            }
          ]
        },
        {
          blockType: 'feature-cards',
          eyebrow: 'Discover',
          heading: 'Explore the Universe',
          intro:
            'From massive red giants to ultra-dense neutron stars, discover the fascinating world of stellar astronomy.',
          columns: '3',
          items: [
            {
              brand: {
                icon: 'FireIcon',
                color: 'red-500'
              },
              title: 'Red Giants',
              description:
                'Massive stars in their late stage, expanding to many times their original size.'
            },
            {
              brand: {
                icon: 'StarIcon',
                color: 'indigo-400'
              },
              title: 'Binary Stars',
              description:
                'Stellar systems with two stars orbiting their common center of mass.'
            },
            {
              brand: {
                icon: 'SparklesIcon',
                color: 'purple-500'
              },
              title: 'Neutron Stars',
              description:
                'Ultra-dense stellar remnants formed from the cores of massive supernovae.'
            }
          ]
        },
        {
          blockType: 'callout',
          showMark: true,
          heading: 'Curious about the cosmos?',
          body: 'Dive deeper into our collection of stellar astronomy articles.',
          link: {
            type: 'custom',
            url: '/binary-stars',
            label: 'Read articles',
            newTab: false
          }
        },
        {
          blockType: 'form',
          form: {
            lookupTitle: 'Contact'
          },
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
        lookupSlug: 'red-giants'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'binary-stars'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'neutron-stars'
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
      title: 'Supergiant Stars',
      slug: 'supergiant-stars',
      content:
        "# Supergiant Stars\nSupergiant stars are the most massive and luminous stars in the universe. These stellar giants have exhausted the hydrogen in their cores and expanded to enormous sizes. Betelgeuse in the constellation Orion is a famous example, with a diameter roughly 700 times that of our Sun.\n\nThese stars have relatively short lifespans of only a few million years compared to the billions of years that smaller stars like our Sun live. Their enormous mass causes them to burn through their nuclear fuel at an accelerated rate.\n\nDespite their rarity, supergiants have played a crucial role in the universe's evolution. When they die in spectacular supernova explosions, they create and distribute heavy elements throughout the cosmos that eventually form new stars, planets, and even life.\n\n## Observational Characteristics\nSupergiants come in different spectral types from blue to red. Blue supergiants like Rigel are extremely hot with surface temperatures around 20,000 Kelvin, while red supergiants like Antares are cooler (around 3,500 Kelvin) but much larger in physical size.\n\nThe extreme luminosity of these stars makes them visible across vast cosmic distances, allowing astronomers to use them as standard candles for measuring distances to other galaxies. Their atmospheres also provide valuable laboratories for studying stellar physics under extreme conditions.\n\n",
      createdAt: '2026-01-10',
      authors: [
        {
          lookupEmail: 'antares@local.dev'
        }
      ],
      categories: [
        {
          lookupSlug: 'star-types'
        }
      ]
    },
    {
      title: 'White Dwarf Stars',
      slug: 'white-dwarf-stars',
      content:
        '# White Dwarf Stars\nWhite dwarfs represent the final evolutionary state for the vast majority of stars in our universe, including our Sun. These stellar remnants form when stars of low to medium mass have exhausted their nuclear fuel and shed their outer layers.\n\nDespite having masses comparable to our Sun, white dwarfs are incredibly dense, compressing that mass into a volume roughly the size of Earth. A sugar cube-sized piece of white dwarf material would weigh approximately one ton on Earth.\n\nThese stars no longer produce energy through nuclear fusion. Instead, they slowly cool over billions of years, eventually fading to black dwarfs (though the universe isn\'t old enough for any white dwarfs to have cooled completely yet).\n\n## Physical Properties\nWhite dwarfs are supported against gravitational collapse by electron degeneracy pressure, a quantum mechanical effect that prevents electrons from occupying the same energy states. This creates an upper mass limit called the Chandrasekhar limit (about 1.4 solar masses) beyond which electron degeneracy cannot prevent collapse.\n\nIn binary systems, white dwarfs can pull material from companion stars, sometimes leading to nova explosions when hydrogen accumulates on their surfaces and undergoes fusion. If a white dwarf accumulates enough mass to approach the Chandrasekhar limit, it may explode as a Type Ia supernova, which astronomers use as "standard candles" for measuring cosmic distances.\n\n',
      createdAt: '2026-03-23',
      authors: [
        {
          lookupEmail: 'vega@local.dev'
        }
      ],
      categories: [
        {
          lookupSlug: 'star-types'
        }
      ]
    },
    {
      title: 'The Hertzsprung-Russell Diagram',
      slug: 'the-hertzsprung-russell-diagram',
      content:
        "# The Hertzsprung-Russell Diagram\nThe Hertzsprung-Russell (H-R) diagram is one of the most important tools in stellar astronomy, providing a graphical relationship between stars' luminosities and their surface temperatures or spectral classifications. Developed independently by Ejnar Hertzsprung and Henry Norris Russell in the early 1900s, this diagram revolutionized our understanding of stellar evolution.\n\nThe diagram plots stars with temperature or spectral class on the x-axis (hottest to coolest, moving right) and luminosity or absolute magnitude on the y-axis (brightest at the top). When stars are plotted this way, they don't distribute randomly but instead fall into distinct groupings that reveal their evolutionary stages.\n\nThe main sequence is a diagonal band running from the upper left (hot, luminous stars) to the lower right (cool, dim stars) where stars spend most of their hydrogen-burning lives. Our Sun is a G-type main sequence star situated in the middle regions of this band.\n\n## Evolutionary Tracks\nAs stars evolve, they move to different regions of the H-R diagram. When a main sequence star exhausts its core hydrogen, it moves upward and rightward to become a red giant. More massive stars evolve into supergiants in the upper right portion of the diagram.\n\nThe diagram also shows white dwarfs clustered in the lower left - hot but dim stars in their final evolutionary stages. By studying a star's position on the H-R diagram and how that position changes over time, astronomers can determine its age, mass, and evolutionary stage, making this diagram an invaluable tool for understanding stellar lifecycles.\n\n",
      createdAt: '2026-03-31',
      authors: [
        {
          lookupEmail: 'vega@local.dev'
        }
      ],
      categories: [
        {
          lookupSlug: 'stellar-evolution'
        }
      ]
    },
    {
      title: 'Open Star Clusters',
      slug: 'open-star-clusters',
      content:
        '# Open Star Clusters\nOpen star clusters are groups of stars that formed together from the same giant molecular cloud and remain loosely bound by mutual gravitational attraction. Unlike their densely packed cousins, globular clusters, open clusters typically contain younger stars (a few million to a few billion years old) and are found primarily in the spiral arms of galaxies.\n\nThe Milky Way contains thousands of open clusters, though only about 1,100 have been discovered and cataloged. Famous examples include the Pleiades (Seven Sisters), the Hyades in Taurus, and the Double Cluster in Perseus. Most open clusters contain between a few dozen and a few thousand stars.\n\nOpen clusters are astronomical treasure troves because all their stars formed at roughly the same time from the same molecular cloud. This means they have the same age and initial chemical composition but different masses. This makes them perfect laboratories for testing theories of stellar evolution, as astronomers can observe how stars of different masses evolve from the same starting point.\n\n## Cluster Evolution\nOver time, open clusters gradually disperse as their stars are stripped away by the gravitational influence of passing molecular clouds or other clusters. This process accelerates as the cluster orbits through the galactic disk, encountering more disruptive forces.\n\nOur Sun likely formed in an open cluster about 4.6 billion years ago, but that cluster has long since dispersed. By studying the chemical signatures of stars, astronomers can sometimes identify "siblings" of our Sun—stars that formed in the same cluster but have since been scattered throughout the galaxy.\n\n',
      createdAt: '2026-09-06',
      authors: [
        {
          lookupEmail: 'vega@local.dev'
        }
      ],
      categories: [
        {
          lookupSlug: 'star-clusters'
        }
      ]
    }
  ]
};

export default star;
