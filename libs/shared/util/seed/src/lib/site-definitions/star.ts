import type { SiteDefinition } from '../site-definition';

/**
 * The Star workspace, as it is seeded in development.
 *
 * Deliberately minimal — Star's only job is to be the *foreign* tenant in the
 * cms e2e isolation tests (a valid tenant with its own api key and users, that
 * moon-scoped tests must never reach). It carries just enough content to stay
 * a real, valid site: a home page, one other page, one post and the form the
 * home page points at. See `star.spec.ts` for the shape this pins.
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

  categories: [
    {
      name: 'Star Types',
      slug: 'star-types'
    }
  ],

  pages: [
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
            }
          ]
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
                  '## Red Giants 🔴\nRed giants are stars nearing the end of their lives, swollen to many times their original size as the hydrogen fuel in their core runs out.\n'
              }
            }
          ]
        }
      ]
    }
  ],

  navigation: [
    {
      reference: {
        relationTo: 'pages',
        lookupSlug: 'red-giants'
      }
    }
  ],

  posts: [
    {
      title: 'Supergiant Stars',
      slug: 'supergiant-stars',
      content:
        '# Supergiant Stars\nSupergiant stars are among the most massive and luminous stars known, many times larger than the Sun.\n',
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
    }
  ]
};

export default star;
