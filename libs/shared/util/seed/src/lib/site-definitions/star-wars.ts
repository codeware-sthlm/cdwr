import type { SiteDefinition } from '../site-definition';

/**
 * The Star Wars workspace, as it is seeded in preview.
 *
 * Transcribed from `seed.preview.ts` and `custom-seed.ts` rather than
 * invented, so a preview deployment keeps showing what it showed before.
 */

export const starWars: SiteDefinition = {
  name: 'star-wars',
  description: 'The Star Wars workspace seeded in preview',

  forms: [
    {
      title: 'Contact',
      emailLabel: 'Your email',
      emailPlaceholder: 'you@example.com',
      submitLabel: 'Reach out',
      confirmation: 'Thanks! We will get back to you shortly.',
      subject: 'New message from {{email}}',
      emailTo: 'hello@star-wars.dev'
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
      name: 'Spacecrafts',
      slug: 'spacecrafts'
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
      name: 'Home',
      slug: 'home',
      layout: [
        {
          blockType: 'hero',
          badge: 'Star Wars',
          heading: 'Welcome to the Galaxy Archives',
          lede: 'Explore the stories of those who shaped the fate of the galaxy — from legendary Jedi Masters to brave Rebel leaders.',
          actions: [
            {
              link: {
                type: 'custom',
                url: '/obi-wan-kenobi',
                label: 'Discover Obi-Wan',
                newTab: false
              },
              emphasis: 'primary'
            },
            {
              link: {
                type: 'custom',
                url: '/luke-skywalker',
                label: 'Luke Skywalker',
                newTab: false
              },
              emphasis: 'secondary'
            }
          ]
        },
        {
          blockType: 'feature-cards',
          eyebrow: 'Characters',
          heading: 'Iconic Heroes of the Galaxy',
          intro:
            'From Jedi Knights to rebel leaders, discover the remarkable individuals who determined the fate of a galaxy far, far away.',
          columns: '3',
          items: [
            {
              brand: {
                icon: 'ShieldCheckIcon',
                color: 'blue-400'
              },
              title: 'Obi-Wan Kenobi',
              description:
                'Legendary Jedi Master whose training of Anakin and Luke Skywalker changed the fate of the galaxy.'
            },
            {
              brand: {
                icon: 'StarIcon',
                color: 'yellow-400'
              },
              title: 'Luke Skywalker',
              description:
                'Farm boy turned Jedi Knight whose belief in redemption brought balance to the Force.'
            },
            {
              brand: {
                icon: 'BoltIcon',
                color: 'red-500'
              },
              title: 'Darth Vader',
              description:
                "Dark Lord of the Sith and the Emperor's enforcer, with a destiny that shocked the galaxy."
            }
          ]
        },
        {
          blockType: 'callout',
          showMark: true,
          heading: 'May the Force be with you.',
          body: 'Read our in-depth articles on galactic history and the ways of the Force.',
          link: {
            type: 'custom',
            url: '/obi-wan-kenobi',
            label: 'Read the archives',
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
    },
    {
      name: 'Obi-Wan',
      slug: 'obi-wan-kenobi',
      header: 'Obi-Wan Kenobi: The Legendary Jedi Master',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  "## The Negotiator\n\nObi-Wan Kenobi, also known as Ben Kenobi, was a legendary Jedi Master who served the Galactic Republic during its final years. Renowned for his skills as a negotiator, he earned his nickname through his preferred approach to conflict resolution.\n\n## Legacy of Training\n\nAs a Jedi Master, Obi-Wan was responsible for training Anakin Skywalker, who would later become Darth Vader. Years later, he would also become Luke Skywalker's first mentor in the ways of the Force, setting in motion events that would eventually lead to the fall of the Galactic Empire."
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Leia',
      slug: 'princess-leia',
      header: 'Princess Leia Organa: Leader of the Rebellion',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  "## Royal Heritage\n\nPrincess Leia Organa of Alderaan was one of the Rebellion's greatest leaders. Adopted daughter of Bail and Breha Organa, she grew up as part of Alderaan's royal family while secretly being trained in politics and resistance.\n\n## Rebel Leader\n\nAs a leader of the Rebel Alliance, Leia demonstrated exceptional tactical ability and unwavering courage. Her diplomatic skills, combined with her fierce determination, made her an instrumental figure in the fight against the Empire."
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Luke',
      slug: 'luke-skywalker',
      header: 'Luke Skywalker: The Last Jedi',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Journey to Becoming a Jedi\n\nLuke Skywalker began his journey as a simple moisture farmer on Tatooine before discovering his connection to the Force. Under the guidance of Obi-Wan Kenobi and later Master Yoda, he embarked on the path to become a Jedi Knight.\n\n## Hero of the Rebellion\n\nAs the pilot who destroyed the first Death Star and later a full-fledged Jedi Knight, Luke became a symbol of hope for the Rebel Alliance. His unwavering belief in the good within his father ultimately led to the redemption of Anakin Skywalker and the downfall of the Empire.'
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Yoda',
      slug: 'master-yoda',
      header: 'Master Yoda: The Wise Jedi Master',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Grand Master of the Jedi Order\n\nFor over 800 years, Yoda trained Jedi as the Grand Master of the Jedi Order. His wisdom, deep connection to the Force, and unique teaching methods helped shape generations of Jedi Knights.\n\n## Legacy of Wisdom\n\nEven in exile after the fall of the Republic, Yoda continued to serve the light side of the Force. His training of Luke Skywalker proved crucial in preserving the Jedi ways and ultimately bringing balance to the Force.'
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Darth Vader',
      slug: 'darth-vader',
      header: 'Darth Vader: Dark Lord of the Sith',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  "## Rise of Vader\n\nOnce a powerful Jedi Knight, Anakin Skywalker was seduced by the dark side of the Force and became Darth Vader. As the Emperor's chief enforcer, he helped hunt down the remaining Jedi and establish Imperial rule across the galaxy.\n\n## The Empire's Enforcer\n\nAs a Dark Lord of the Sith, Vader commanded the Empire's military might with terrifying efficiency. His mastery of the Force and tactical brilliance made him one of the most feared figures in the galaxy."
              }
            }
          ]
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
        lookupSlug: 'obi-wan-kenobi'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'princess-leia'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'luke-skywalker'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'master-yoda'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'darth-vader'
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
      title: 'The Rise and Fall of the Empire',
      slug: 'rise-and-fall-of-empire',
      content:
        '## The Birth of Imperial Rule\n\nThe transformation of the Republic into the Empire stands as one of the most significant events in galactic history.\n\n> "So this is how liberty dies... with thunderous applause." - Padmé Amidala\n\nThe key factors that enabled Palpatine\'s rise to power:\n\n* The manipulation of the Trade Federation\n* The engineered Clone Wars\n* The systematic dismantling of democratic institutions\n* The turning of Anakin Skywalker\n\n## The Rebellion Rises\n\nFrom the ashes of the Republic, hope emerged. The Rebel Alliance formed from:\n\n* Disillusioned Senators\n* Former Republic military officers\n* Oppressed planetary systems\n* Idealistic freedom fighters\n\n> "The more you tighten your grip, Tarkin, the more star systems will slip through your fingers."\n\n## Legacy\n\nThe Empire\'s fall teaches us that:\n\n* No military might can overcome the will of free peoples\n* Hope remains strongest in the darkest times\n* The light side of the Force will always prevail',
      createdAt: '2026-09-01',
      authors: [
        {
          lookupEmail: 'yoda@local.dev'
        }
      ]
    },
    {
      title: 'Jedi Training Methods',
      slug: 'jedi-training-methods',
      content:
        '## Traditional Approaches\n\n> "A Jedi must have the deepest commitment, the most serious mind." - Master Yoda\n\nThe path to becoming a Jedi requires:\n\n* Meditation and Force attunement\n* Lightsaber combat training\n* Study of Jedi philosophy\n* Practical application of Force abilities\n\n## Modern Adaptations\n\nThe changing galaxy has necessitated new training methods:\n\n* Accelerated combat training\n* Focus on practical Force applications\n* Emphasis on stealth and survival\n* Integration of modern technology\n\n> "Your focus determines your reality."\n\nRemember that the Force:\n\n* Flows through all living things\n* Requires balance and harmony\n* Demands patience and discipline',
      createdAt: '2026-09-15',
      authors: [
        {
          lookupEmail: 'luke@local.dev'
        }
      ]
    },
    {
      title: 'Spacecraft of the Rebellion',
      slug: 'spacecraft-of-rebellion',
      content:
        '## Famous Vessels\n\nThe Rebel Alliance relied on various spacecraft to combat the Empire:\n\n* X-wing Starfighter\n  * Versatile and agile\n  * Equipped with hyperdrive\n  * Proven track record\n* Y-wing Bomber  * Durable design\n  * Heavy payload capacity\n\n> "She may not look like much, but she\'s got it where it counts, kid."\n\n## Iconic Modifications\n\nThe most successful modifications included:\n\n* Enhanced shield generators\n* Modified weapon systems\n* Upgraded navigation computers\n\n> "Great shot kid, that was one in a million!"\n\nMaintenance tips:\n\n* Regular hyperdrive alignment\n* Frequent shield calibration\n* Careful power distribution',
      createdAt: '2026-09-30',
      authors: [
        {
          lookupEmail: 'luke@local.dev'
        },
        {
          lookupEmail: 'yoda@local.dev'
        }
      ],
      categories: [
        {
          lookupSlug: 'spacecrafts'
        }
      ]
    }
  ]
};

export default starWars;
