import type { SiteDefinition } from '../site-definition';

/**
 * The Marvel workspace, as it is seeded in preview.
 *
 * Transcribed from `seed.preview.ts` and `custom-seed.ts` rather than
 * invented, so a preview deployment keeps showing what it showed before.
 */

export const marvel: SiteDefinition = {
  name: 'marvel',
  description: 'The Marvel workspace seeded in preview',

  forms: [
    {
      title: 'Contact',
      emailLabel: 'Your email',
      emailPlaceholder: 'you@example.com',
      submitLabel: 'Reach out',
      confirmation: 'Thanks! We will get back to you shortly.',
      subject: 'New message from {{email}}',
      emailTo: 'hello@marvel.dev'
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
      name: 'Technology',
      slug: 'technology'
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
          badge: 'Marvel',
          heading: 'Welcome to the Marvel Universe',
          lede: "Earth's mightiest heroes, assembled. Explore the stories of remarkable individuals who protect our world from threats beyond imagination.",
          actions: [
            {
              link: {
                type: 'custom',
                url: '/iron-man',
                label: 'Meet the Avengers',
                newTab: false
              },
              emphasis: 'primary'
            },
            {
              link: {
                type: 'custom',
                url: '/spider-man',
                label: 'Spider-Man',
                newTab: false
              },
              emphasis: 'secondary'
            }
          ]
        },
        {
          blockType: 'feature-cards',
          eyebrow: 'Heroes',
          heading: "Earth's Mightiest Heroes",
          intro:
            "From genius inventors to gods of thunder, the Avengers represent humanity's best defence against the forces of evil.",
          columns: '3',
          items: [
            {
              brand: {
                icon: 'CpuChipIcon',
                color: 'red-500'
              },
              title: 'Iron Man',
              description:
                'Genius inventor Tony Stark built a suit of armour and became a founding Avenger.'
            },
            {
              brand: {
                icon: 'BoltIcon',
                color: 'yellow-400'
              },
              title: 'Thor',
              description:
                'Asgardian God of Thunder, wielding Mjolnir as a bridge between two worlds.'
            },
            {
              brand: {
                icon: 'ShieldCheckIcon',
                color: 'blue-600'
              },
              title: 'Black Widow',
              description:
                'Elite spy Natasha Romanoff whose skills and loyalty have saved the world countless times.'
            }
          ]
        },
        {
          blockType: 'callout',
          showMark: true,
          heading: 'Avengers, assemble.',
          body: "Dive into the science, history and stories behind Marvel's most iconic characters.",
          link: {
            type: 'custom',
            url: '/iron-man',
            label: 'Explore the universe',
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
      name: 'Iron Man',
      slug: 'iron-man',
      header: 'Tony Stark: The Armored Avenger',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Genius Inventor\n\nTony Stark transformed from a brilliant weapons inventor into a hero who would reshape the future of technology and heroism. His revolutionary Iron Man suit represents the pinnacle of human innovation and determination.\n\n## Leader and Protector\n\nAs a founding member of the Avengers, Tony has dedicated his genius and resources to protecting Earth. His journey from self-centered businessman to selfless hero has inspired generations.'
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Thor',
      slug: 'thor',
      header: 'Thor: God of Thunder',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  "## Asgardian Heritage\n\nThor, son of Odin, wields the mighty hammer Mjolnir as the God of Thunder. His journey between Asgard and Earth has made him a unique bridge between two worlds.\n\n## Mighty Avenger\n\nAs one of Earth's mightiest heroes, Thor brings both godlike power and noble wisdom to the defense of humanity. His growth from an arrogant prince to a humble protector demonstrates the true meaning of worthiness."
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Spider-Man',
      slug: 'spider-man',
      header: 'Peter Parker: The Amazing Spider-Man',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  '## Origin Story\n\nBitten by a radioactive spider, Peter Parker gained extraordinary abilities. Living by his uncle\'s words that "with great power comes great responsibility," he became one of New York\'s greatest protectors.\n\n## Friendly Neighborhood Hero\n\nBalancing everyday life with heroic duties, Spider-Man represents the best of both worlds. His wit, intelligence, and unwavering sense of responsibility make him a unique figure in the superhero community.'
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Black Widow',
      slug: 'black-widow',
      header: 'Natasha Romanoff: Master Spy and Avenger',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  "## Elite Agent\n\nNatasha Romanoff's journey from Russian spy to Avenger is a testament to the power of redemption. Her unparalleled skills in espionage and combat make her one of the world's deadliest operatives.\n\n## Heart of the Team\n\nDespite lacking superhuman powers, Black Widow's strategic mind and unwavering loyalty have made her essential to the Avengers. Her sacrifices and dedication have helped save the world numerous times."
              }
            }
          ]
        }
      ]
    },
    {
      name: 'Hulk',
      slug: 'hulk',
      header: 'Bruce Banner: The Incredible Hulk',
      layout: [
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  "## Scientific Genius\n\nDr. Bruce Banner's exposure to gamma radiation transformed him into the incredibly powerful Hulk. His struggle to balance his brilliant scientific mind with the raw power of the Hulk defines his unique journey.\n\n## Strongest Avenger\n\nDespite being feared by many, the Hulk has proven himself a hero time and again. Banner's scientific genius combined with Hulk's raw strength makes him one of Earth's most formidable defenders."
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
        lookupSlug: 'iron-man'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'thor'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'spider-man'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'black-widow'
      }
    },
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'hulk'
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
      title: 'Evolution of the Avengers',
      slug: 'evolution-of-avengers',
      content:
        '## The Initiative\n\n> "There was an idea... to bring together a group of remarkable people."\n\nThe original team formed from:\n\n* Tony Stark - Technical genius\n* Steve Rogers - Natural leader\n* Thor - Asgardian strength\n* Bruce Banner - Scientific brilliance\n* Natasha Romanoff - Strategic expertise\n* Clint Barton - Precision and skill\n\n## Team Dynamics\n\nKey factors in the team\'s success:\n\n* Complementary abilities\n* Trust building\n* Shared mission focus\n* Adaptability in crisis\n\n> "We may not be able to save the Earth, but you can be damn sure we\'ll avenge it."\n\nLessons learned:\n\n* Unity overcomes individual limitations\n* Leadership requires sacrifice\n* Heroes can come from anywhere',
      createdAt: '2026-10-05',
      authors: [
        {
          lookupEmail: 'thor@local.dev'
        }
      ]
    },
    {
      title: 'Science of Super Soldiers',
      slug: 'science-of-super-soldiers',
      content:
        '## Historical Development\n\nThe super soldier program revolutionized human enhancement:\n\n* Dr. Erskine\'s Original Formula\n  * Enhanced strength\n  * Improved agility\n  * Accelerated healing\n* Modern Attempts\n  * Various successes and failures\n  * Ethical considerations\n\n> "The serum amplifies everything that is inside. Good becomes great; bad becomes worse."\n\n## Current Research\n\nAreas of ongoing investigation:\n\n* Genetic modification\n* Biological enhancement\n* Technological integration\n* Neural advancement\n\n> "Our very strength invites challenge. Challenge incites conflict. And conflict... breeds catastrophe."',
      createdAt: '2026-10-10',
      authors: [
        {
          lookupEmail: 'hulk@local.dev'
        }
      ]
    },
    {
      title: 'Tech Revolution',
      slug: 'tech-revolution',
      content:
        '## Arc Reactor Technology\n\n> "Sometimes you gotta run before you can walk."\n\nKey innovations include:\n\n* Miniaturized power sources\n* Clean energy applications\n* Advanced propulsion systems\n* Neural interface developments\n\n## Future of Combat Suits\n\nNext-generation features:\n\n* Nano-tech integration\n* AI-driven responses\n* Adaptive armor systems\n* Multi-environment functionality\n\n> "The suit and I are one."\n\nSafety protocols:\n\n* Biometric security\n* Emergency protocols\n* Power management\n* Environmental controls',
      createdAt: '2026-10-12',
      authors: [
        {
          lookupEmail: 'hulk@local.dev'
        }
      ],
      categories: [
        {
          lookupSlug: 'technology'
        }
      ]
    }
  ]
};

export default marvel;
