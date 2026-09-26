import { cdwrCloudSvg } from '@codeware/shared/util/ui';

import type { SiteDefinition } from '../site-definition';

import { infisicalLogo, playwrightLogo } from './tech-logos';

/**
 * `cdwr.io` — the platform showcase, as data.
 *
 * The governing idea from COD-475's content plan: **the showcase is the
 * product**. Every claim here is something a visitor can see working in the
 * page they are reading, rendered by the renderer that serves every tenant.
 * This file is itself part of that argument — the site is a document, applied
 * to a workspace, reviewable in a pull request.
 *
 * **Written for the person who signs**, in words an engineer will recognise
 * as the real thing. So the landing page is the show — long, sectioned, one
 * claim per band — and every other page tells the same story plainly: what
 * this is, the live thing itself, three facts, and where to go next. Section
 * headings may hook; eyebrows and the small titles under them say exactly
 * what the visitor is looking at.
 *
 * **Draft copy.** Close to final in structure, not in wording. What it cannot
 * state yet: the illustrations are still to be drawn — `media` is left empty
 * where one belongs. Screenshots are avoided on purpose: a site whose point is
 * that it renders live should not argue with pictures of an admin.
 *
 * The gallery's own index and browser pages are route chrome built from the
 * block registry, so they are not authored here — `/blocks` is.
 */
export const cdwrIo: SiteDefinition = {
  name: 'cdwr.io',
  description: 'The platform showcase — a live demo, not a description of one',

  categories: [
    { name: 'Themes', slug: 'themes' },
    { name: 'Palette', slug: 'palette' },
    { name: 'Studio', slug: 'studio' },
    { name: 'Design system', slug: 'design-system' },
    { name: 'Accessibility', slug: 'accessibility' },
    { name: 'Multi-tenancy', slug: 'multi-tenancy' }
  ],

  pages: [
    // ── The landing page: the show ─────────────────────────────────────────
    {
      name: 'Home',
      slug: 'home',
      layout: [
        {
          blockType: 'hero',
          badge: 'Themes you author in the admin',
          heading: 'Every site its own. One platform underneath.',
          lede: 'A content platform built on Payload and Next.js. Each site gets its own domain, its own theme and its own editors — and this page is one of them.',
          actions: [
            {
              link: {
                type: 'custom',
                url: '/studio',
                label: 'Try the theme studio'
              },
              emphasis: 'primary'
            },
            {
              link: {
                type: 'custom',
                url: '/architecture',
                label: 'How it is built'
              },
              emphasis: 'secondary'
            }
          ]
        },
        {
          blockType: 'feature-cards',
          eyebrow: 'What you get',
          band: 'subtle',
          heading: 'Four things, each of them demonstrable',
          columns: '2',
          items: [
            {
              title: 'Each site is its own deployment',
              description:
                'Its own domain, certificate and secrets, from one shared build. Sites are isolated without a build per customer.'
            },
            {
              title: 'The look is a setting, not a stylesheet',
              description:
                'A site chooses its palette, its light or dark scheme and whether visitors may switch. Changed in the admin, live at once.'
            },
            {
              title: 'Pages are built from blocks',
              description:
                'Composable blocks — prose, media, code, forms, tours. Editors compose; nothing is hand-coded per site.'
            },
            {
              title: 'Every change is reviewed running',
              description:
                'Each pull request gets a site of its own with its own database. Content and code are checked the same way: by using them.'
            }
          ]
        },
        {
          blockType: 'feature-section',
          eyebrow: 'Theming',
          heading: 'Change the look. Nothing reloads.',
          intro:
            'A site chooses its palette, its colour scheme, and whether visitors may switch at all. Set in the admin, not in a stylesheet.',
          enableLink: true,
          link: {
            type: 'custom',
            url: '/studio',
            label: 'See how themes work'
          },
          subFeatures: [
            {
              title: 'Chosen in settings',
              body: 'A site with one theme shows no switcher. Give it several and the control appears on its own.'
            },
            {
              title: 'Light, dark, or fixed',
              body: 'A site can be held to one scheme when the brand demands it.'
            },
            {
              title: 'Decided on the server',
              body: 'The choice ships with the page, so nothing flashes the wrong colour on first paint.'
            }
          ]
        },
        {
          blockType: 'feature-section',
          eyebrow: 'Theme studio',
          band: 'strong',
          heading: 'A theme you cannot save until it is readable',
          intro:
            'Pick a brand colour and the studio derives the rest — surfaces, borders, charts, prose. Every pairing is checked for readability as you go, and one that fails cannot be published.',
          enableLink: true,
          link: { type: 'custom', url: '/studio', label: 'Open the studio' },
          subFeatures: [
            {
              title: 'The whole palette from one colour',
              body: 'Surfaces, borders, charts and prose all follow from the brand colour, by a recipe you can read back.'
            },
            {
              title: 'Start from a built-in',
              body: 'Open a platform theme, change what you need, keep the rest.'
            },
            {
              title: 'The randomiser cannot fail',
              body: 'It re-rolls until the result passes, so it never hands you an unreadable theme.'
            }
          ]
        },
        {
          blockType: 'feature-section',
          eyebrow: 'Content',
          heading: 'Every block, rendered by the renderer that serves it',
          intro:
            'Each on its own page, with the production component and a paragraph on when to reach for it. Editors compose pages from these; a block that renders badly is visible to everyone, immediately.',
          enableLink: true,
          link: { type: 'custom', url: '/blocks', label: 'Browse the gallery' }
        },
        {
          // Placeholder copy, deliberately. A quote is the one thing on this
          // site that cannot be written by the person who built it.
          blockType: 'testimonial',
          quote:
            '[A CLIENT SENTENCE — the thing they say when they describe the work to someone else. One or two lines, in their words.]',
          author: { name: '[NAME]', role: '[ROLE, COMPANY]' },
          enableLink: true,
          link: { type: 'custom', url: '/start', label: 'Read the story' }
        },
        {
          blockType: 'pill-list',
          eyebrow: 'Built on',
          heading: 'Nothing exotic, and nothing hidden',
          intro:
            'The interesting decisions are in how these fit together, not in the list itself.',
          band: 'subtle',
          items: [
            {
              label: 'Payload CMS',
              url: 'https://payloadcms.com',
              icon: 'payload'
            },
            { label: 'Next.js', url: 'https://nextjs.org', icon: 'nextjs' },
            {
              label: 'Supabase',
              url: 'https://supabase.com',
              icon: 'supabase'
            },
            { label: 'Fly.io', url: 'https://fly.io', icon: 'flyio' },
            {
              label: 'Infisical',
              url: 'https://infisical.com',
              logo: { source: 'svg', svgCode: infisicalLogo }
            },
            { label: 'Nx', url: 'https://nx.dev', icon: 'nx' },
            {
              label: 'Tailwind',
              url: 'https://tailwindcss.com',
              icon: 'tailwind'
            },
            {
              label: 'Playwright',
              url: 'https://playwright.dev',
              logo: { source: 'svg', svgCode: playwrightLogo }
            },
            { label: 'Sentry', url: 'https://sentry.io', icon: 'sentry' },
            {
              label: 'GitHub',
              url: 'https://github.com/codeware-sthlm/cdwr',
              icon: 'github'
            }
          ]
        },
        {
          blockType: 'posts',
          title: 'What shipped recently',
          description:
            'Short entries when something lands. The honest answer to whether the platform is maintained.',
          limit: 3
        },
        {
          blockType: 'callout',
          showMark: true,
          heading: 'Build on the same platform',
          body: 'The plugin, the preset and the deployment tooling behind this site are published. One command starts a workspace of your own.',
          link: { type: 'custom', url: '/start', label: 'Get started' }
        }
      ]
    },

    // ── The gallery: route chrome built from the registry ──────────────────
    {
      name: 'Blocks',
      slug: 'blocks',
      layout: [
        {
          blockType: 'block-gallery',
          eyebrow: 'Every block',
          heading: 'Rendered by the renderer that serves it',
          intro:
            'Not a gallery of screenshots. Each example below is the production component, drawing from the same content API a site uses — so a block that renders badly under a theme is visible here, to everyone, immediately.',
          mode: 'index'
        }
      ]
    },

    // ── The other pages: tell it plainly ───────────────────────────────────
    {
      name: 'Studio',
      slug: 'studio',
      layout: [
        {
          blockType: 'hero',
          badge: 'Theme studio',
          heading: 'A theme you cannot save until it is readable',
          lede: 'Pick a brand colour. The studio derives every other colour from it and checks each pairing for readability while you work. A theme that fails cannot be published.'
        },
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown: [
                  '## What a theme is here',
                  '',
                  'A theme is not a stylesheet somebody wrote by hand. It is a handful of decisions — a brand colour, a base tone, a surface, a corner radius, the typefaces — and a recipe that turns those into every value a page needs: backgrounds, borders, focus rings, prose, chart colours.',
                  '',
                  'Because the recipe is what gets saved, a theme can be reopened and changed later. It parses back to the decisions that made it, not to a pile of numbers.',
                  '',
                  '## What "cannot save" means',
                  '',
                  'Text on a background has to be readable, and readability has a number: the contrast between the two. The studio measures every pairing against the accessibility standard as you work, and the save button stays off while any pair is below the line. You can still pin any single value by hand — the studio marks it, so a later change of brand colour does not surprise you.'
                ].join('\n')
              }
            }
          ]
        },
        {
          // The prose above has already said what this is, so no header —
          // just the studio, opened on the theme this site runs
          blockType: 'theme-studio',
          startFrom: 'spotlight',
          note: 'Live — the studio itself, not a screenshot of it. Nothing you do here leaves your browser.'
        },
        {
          blockType: 'feature-cards',
          eyebrow: 'Three facts',
          heading: 'What the studio guarantees',
          columns: '3',
          items: [
            {
              title: 'A handful of decisions',
              description:
                'Brand, base, surface, radius and typefaces, and where links and charts take their colour. Everything else follows.'
            },
            {
              title: 'Overrides are marked',
              description:
                'Any single value can be pinned by hand, and the studio shows which ones were.'
            },
            {
              title: 'Reopens as the recipe',
              description:
                'A saved theme parses back to what made it, so it can be changed rather than only overwritten.'
            }
          ]
        }
      ]
    },
    {
      name: 'Architecture',
      slug: 'architecture',
      layout: [
        {
          blockType: 'hero',
          badge: 'Architecture',
          heading: 'Every site is its own deployment',
          lede: 'A site is not a row in a table with a theme name. It is an app of its own, on its own domain, with its own certificate and its own secrets — built once and run many times.'
        },
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown: [
                  '## One build, many sites',
                  '',
                  'The platform is built once, when a change is merged. That one build is then started as many times as there are sites, and each start is told which site it is. Everything that differs between two sites — the domain, the certificate, the secrets — arrives at start-up rather than being baked in. Their content lives in one shared database, kept apart by the platform itself.',
                  '',
                  'So codeware.se and cdwr.io are the same software, running twice. A third client site would be the same software running a third time, with different everything else.',
                  '',
                  '## Every change is reviewed running',
                  '',
                  'Each pull request gets a running site and a database of its own, provisioned when the branch opens and torn down when it merges. A content change and a code change are reviewed the same way — by opening the thing and using it.'
                ].join('\n')
              }
            }
          ]
        },
        // An illustration belongs here: one build fanning out into three
        // sites. Left as text until it is drawn.
        {
          blockType: 'feature-cards',
          eyebrow: 'Three facts',
          heading: 'What a pull request gets',
          columns: '3',
          items: [
            {
              title: 'Its own database',
              description:
                'From a dedicated preview cluster, seeded on first boot, dropped with the branch.'
            },
            {
              title: 'Migrations run first',
              description:
                'A schema change that would fail on deploy fails on the pull request instead.'
            },
            {
              title: 'A visual review too',
              description:
                'Every component renders in every theme on every change, and the difference is a picture.'
            }
          ]
        },
        {
          // Infisical and Playwright are not in the icon set, and feature
          // cards take no logo of their own yet, so they carry an icon
          blockType: 'feature-cards',
          eyebrow: 'Built on',
          heading: 'What it is built on, and why',
          columns: '2',
          items: [
            {
              brand: { tech: 'payload' },
              title: 'Payload CMS',
              description:
                'The editor and the content API. Open source, and the whole admin is code we can change.'
            },
            {
              brand: { tech: 'nextjs' },
              title: 'Next.js',
              description: 'Serves the sites and the admin from one app.'
            },
            {
              brand: { tech: 'supabase' },
              title: 'Supabase',
              description:
                'Postgres and file storage. One database per environment, shared by every site in it; the platform keeps each site to its own content.'
            },
            {
              brand: { tech: 'flyio' },
              title: 'Fly.io',
              description:
                'Runs each site as its own app, close to its visitors.'
            },
            {
              brand: { icon: 'KeyIcon' },
              title: 'Infisical',
              description:
                'Holds every secret, one folder per site, so nothing lives in the repository.'
            },
            {
              brand: { tech: 'nx' },
              title: 'Nx',
              description:
                'One repository for the platform, its tools and its published packages.'
            },
            {
              brand: { tech: 'tailwind' },
              title: 'Tailwind',
              description: 'The styling the themes compile down to.'
            },
            {
              brand: { icon: 'CursorArrowRaysIcon' },
              title: 'Playwright',
              description: 'The tests that open the running site and use it.'
            }
          ]
        }
      ]
    },
    {
      name: 'Devlog',
      slug: 'devlog',
      layout: [
        {
          blockType: 'hero',
          badge: 'Devlog',
          heading: 'What shipped, and why',
          lede: 'Short entries when something lands. Written once, dated, and not edited afterwards — which makes this the honest answer to whether the platform is maintained.'
        },
        {
          blockType: 'posts',
          title: 'Entries',
          description: 'Newest first.',
          limit: 10
        }
      ]
    },
    {
      name: 'Get started',
      slug: 'start',
      layout: [
        {
          blockType: 'hero',
          badge: 'Get started',
          heading: 'Start from the same setup',
          lede: 'The plugin, the preset and the deployment tooling this platform runs on are all published. Take them and start a platform of your own.'
        },
        {
          blockType: 'content',
          columns: [
            {
              size: 'full',
              richText: {
                markdown:
                  'One command scaffolds a new workspace with Payload, Postgres and the deployment wiring already connected:'
              }
            }
          ]
        },
        {
          blockType: 'code',
          language: 'plaintext',
          code: [
            'npx create-nx-payload@latest my-platform',
            'cd my-platform && nx dev cms'
          ].join('\n')
        },
        {
          blockType: 'feature-cards',
          eyebrow: 'Three packages, published',
          heading: 'Usable on their own, without adopting anything else here',
          columns: '3',
          items: [
            {
              brand: { tech: 'nx' },
              title: '@cdwr/nx-payload',
              description:
                'An Nx plugin adding Payload generators and executors to any workspace. Scaffold an app, run migrations, build for deploy.'
            },
            {
              brand: { tech: 'payload' },
              title: 'create-nx-payload',
              description:
                'The preset behind the command above — a new workspace with Payload, Postgres and the deployment wiring already connected.'
            },
            {
              brand: { tech: 'flyio' },
              title: '@cdwr/fly-node',
              description:
                'A programmatic Node wrapper around the Fly CLI. What the deployment tooling here is built on.'
            }
          ]
        },
        {
          blockType: 'callout',
          showMark: true,
          heading: 'The source is open',
          body: 'Read how it is built, follow along as it changes, or open an issue when something does not work the way this site says it does.',
          link: {
            type: 'custom',
            url: 'https://github.com/codeware-sthlm/cdwr',
            label: 'Open the repository',
            newTab: true
          }
        }
      ]
    }
  ],

  posts: [
    {
      title: 'The Codeware blue finally has a name',
      slug: 'codeware-blue-has-a-name',
      createdAt: '2026-09-06T09:00:00.000Z',
      categories: [{ lookupSlug: 'themes' }, { lookupSlug: 'palette' }],
      content:
        "The admin's brand ramp was eleven hand-cut hex values that no palette shipped, so the theme parser could not recognise it — it fell back to neutral and reported every step as an override. It is now a named family, which means the studio shows the real brand instead of a lie."
    },
    {
      title: 'Naming the variants the admin had been copying by hand',
      slug: 'naming-the-variants',
      createdAt: '2026-09-06T08:00:00.000Z',
      categories: [
        { lookupSlug: 'design-system' },
        { lookupSlug: 'accessibility' }
      ],
      content:
        'Eight cards, three toolbar buttons and four status badges were carrying the same class lists pasted between files. Each is now a named variant, which means Storybook shows what the admin actually renders — and an accessibility test caught a brand button that failed contrast on one theme before anyone saw it.'
    },
    {
      title: 'Pick a colour instead of typing one',
      slug: 'pick-a-colour-instead-of-typing-one',
      createdAt: '2026-09-05T09:00:00.000Z',
      categories: [{ lookupSlug: 'studio' }],
      content:
        "The theme studio's fine-tuning panel edited ninety CSS values through a text field. It now has a real colour picker that writes back in the same notation the rest of the theme uses, so the contrast report keeps working on what you picked."
    },
    {
      title: 'Platform themes can be forked from the admin',
      slug: 'platform-themes-can-be-forked',
      createdAt: '2026-09-03T09:00:00.000Z',
      categories: [{ lookupSlug: 'studio' }, { lookupSlug: 'themes' }],
      content:
        'Until now the studio could export a theme but never open one. A system administrator can now fork a built-in, change what they need, and either save it to a site or take the committed CSS back to the repository.'
    },
    {
      title: 'A site picks its own themes',
      slug: 'a-site-picks-its-own-themes',
      createdAt: '2026-08-28T09:00:00.000Z',
      categories: [{ lookupSlug: 'themes' }, { lookupSlug: 'multi-tenancy' }],
      content:
        'Theme was a build-time import, which meant every site compiled to the same stylesheet. It is now a setting: choose the themes a site offers, and the switcher appears only when there is more than one to switch to.'
    }
  ],

  navigation: [
    {
      reference: { relationTo: 'pages', lookupSlug: 'blocks' },
      label: 'Blocks'
    },
    {
      reference: { relationTo: 'pages', lookupSlug: 'studio' },
      label: 'Studio'
    },
    {
      reference: { relationTo: 'pages', lookupSlug: 'architecture' },
      label: 'Architecture'
    },
    {
      reference: { relationTo: 'pages', lookupSlug: 'devlog' },
      label: 'Devlog'
    },
    {
      reference: { relationTo: 'pages', lookupSlug: 'start' },
      label: 'Get started',
      appearance: 'button'
    }
  ],

  siteSettings: {
    general: {
      appName: 'cdwr.io',
      landingPage: { lookupSlug: 'home' },
      chrome: 'flat',
      icon: { source: 'svg', svgCode: cdwrCloudSvg }
    }
  }
};

export default cdwrIo;
