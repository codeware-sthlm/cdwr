import { cdwrCloudSvg } from '@codeware/shared/util/ui';

import type { PageDefinition, SiteDefinition } from '../site-definition';

import { cdwrIoThemeSwatchSource } from './cdwr-io-components';
import { cdwrIoPrivacyMarkdown } from './cdwr-io-legal';
import {
  blocksIllustration,
  contrastIllustration,
  heroIllustration,
  oneBuildIllustration,
  stackIllustration,
  startIllustration,
  themingIllustration
} from './illustrations';
import {
  infisicalLogo,
  nxLogo,
  playwrightLogo,
  shadcnLogo,
  tanstackLogo,
  umamiLogo
} from './tech-logos';

/** The devlog's listing page, stated only while `devlog` is on */
const devlogPage: PageDefinition = {
  name: 'Devlog',
  slug: 'devlog',
  meta: {
    title: 'What shipped, and why',
    description:
      'Short dated notes on changes to the platform: what shipped and why.'
  },
  layout: [
    {
      blockType: 'hero',
      blockName: 'Intro',
      badge: 'Devlog',
      heading: 'What shipped, and why',
      lede: 'Short dated notes on changes to the platform: what shipped and why.'
    },
    {
      blockType: 'posts',
      blockName: 'All entries',
      categories: [{ lookupSlug: 'devlog' }],
      limit: 10
    }
  ]
};

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
 * this is, the live thing itself, a few facts, and where to go next. Section
 * headings may hook; eyebrows and the small titles under them say exactly
 * what the visitor is looking at.
 *
 * **Illustrations, not screenshots:** a site whose point is that it renders
 * live should not argue with pictures of an admin. The drawings are drawn in
 * the theme's own colours (`./illustrations`), so they recolour with it.
 *
 * The gallery's own index and browser pages are route chrome built from the
 * block registry, so they are not authored here — `/blocks` is.
 *
 * `devlog` puts the Devlog page, its nav item and the home page's recent
 * posts back in place. The definition seeds no posts of its own: entries are
 * drafted elsewhere and published on approval (COD-776).
 */
export function defineCdwrIo({ devlog }: { devlog: boolean }): SiteDefinition {
  return {
    name: 'cdwr.io',
    description: 'The Codeware platform, shown on a site that runs on it',

    categories: [
      { name: 'Themes', slug: 'themes' },
      { name: 'Palette', slug: 'palette' },
      { name: 'Studio', slug: 'studio' },
      { name: 'Design system', slug: 'design-system' },
      { name: 'Accessibility', slug: 'accessibility' },
      { name: 'Multi-tenancy', slug: 'multi-tenancy' },
      // Every devlog draft goes here (cdwr devlog draft looks it up by slug)
      ...(devlog ? [{ name: 'Devlog', slug: 'devlog' }] : [])
    ],

    // The platform's own look, made the way any tenant would make one: a recipe
    // the studio reopens. Violet on slate with a brand-coloured primary, which
    // none of the built-in themes use, so switching away from it shows at once
    customThemes: [
      {
        name: 'cdwr',
        slug: 'cdwr',
        recipe: {
          baseFamily: 'slate',
          brandFamily: 'violet',
          surface: 'flat',
          radius: '0.75rem',
          linkShade: { light: '700', dark: '400' },
          primarySource: 'brand',
          linkSource: 'brand',
          chartSource: 'brand',
          fontBody: 'inter',
          fontHeading: 'inter'
        }
      }
    ],

    pages: [
      // ── The landing page: the show ─────────────────────────────────────────
      {
        name: 'Home',
        slug: 'home',
        meta: {
          title: 'Every site its own. One platform underneath.',
          description:
            'Many sites hosted on one platform built on Payload. Each site gets its own domain, its own theme and its own editors.'
        },
        layout: [
          {
            blockType: 'hero',
            blockName: 'Intro',
            badge: 'Multi-tenant hosting',
            heading: 'Every site its own. One platform underneath.',
            illustration: heroIllustration,
            lede: 'Many sites hosted on one platform built on Payload. Each site gets its own domain, its own theme and its own editors — and this page is one of them.',
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
            blockName: 'What the platform does',
            eyebrow: 'What you get',
            band: 'subtle',
            heading: 'What the platform does',
            columns: '2',
            items: [
              {
                title: 'Each site is its own deployment',
                description:
                  'Its own domain, certificate and secrets, from one shared build. Sites are isolated without a build per customer.'
              },
              {
                title: 'The look is set in the admin',
                description:
                  'A site chooses its palette, its light or dark scheme and whether visitors may switch. Changed in the admin, live at once.'
              },
              {
                title: 'Pages are built from blocks',
                description:
                  'Editors build pages from ready blocks for text, images, code, forms and tours. No site needs code of its own.'
              },
              {
                title: 'Every change is reviewed running',
                description:
                  'Each pull request gets a site of its own with its own database, so a change is tried on a running site before it is merged.'
              }
            ]
          },
          {
            blockType: 'feature-section',
            blockName: 'Live theme switching',
            eyebrow: 'Theming',
            heading: 'Change the look. Nothing reloads.',
            illustration: themingIllustration,
            intro:
              'A site chooses its palette, its colour scheme, and whether visitors may switch at all. All of it is set in the admin.',
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
            blockName: 'Readable themes',
            eyebrow: 'Theme studio',
            band: 'gradient',
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
                title: 'Random themes are readable too',
                body: 'The random button tries again until the result passes the contrast check.'
              }
            ]
          },
          {
            blockType: 'feature-section',
            blockName: 'Custom components',
            eyebrow: 'Custom components',
            heading: 'When no block fits, write one',
            intro:
              'A developer writes a component in the admin, and saving it starts a build. An editor then places it on a page like any other block. The components page shows one written that way, beside its source.',
            enableLink: true,
            link: {
              type: 'custom',
              url: '/components',
              label: 'See the component'
            }
          },
          {
            blockType: 'feature-section',
            blockName: 'Block gallery',
            eyebrow: 'Content',
            heading: 'A gallery of every block',
            band: 'subtle',
            illustration: blocksIllustration,
            intro:
              'Editors build pages from these blocks. The gallery shows each one with the same component a site uses, and says when to use it.',
            enableLink: true,
            link: {
              type: 'custom',
              url: '/blocks',
              label: 'Browse the gallery'
            }
          },
          {
            blockType: 'pill-list',
            blockName: 'Tools it runs on',
            logoColor: 'own',
            eyebrow: 'Built on',
            heading: 'What the platform runs on',
            intro:
              'Open-source tools and hosted services. Each name links to its own site.',
            items: [
              {
                label: 'Payload',
                url: 'https://payloadcms.com',
                icon: 'payload'
              },
              { label: 'Next.js', url: 'https://nextjs.org', icon: 'nextjs' },
              {
                label: 'TanStack Start',
                url: 'https://tanstack.com/start',
                logo: { source: 'svg', svgCode: tanstackLogo }
              },
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
              {
                label: 'Nx',
                url: 'https://nx.dev',
                logo: { source: 'svg', svgCode: nxLogo }
              },
              {
                label: 'Tailwind',
                url: 'https://tailwindcss.com',
                icon: 'tailwind'
              },
              {
                label: 'shadcn/ui',
                url: 'https://ui.shadcn.com',
                logo: { source: 'svg', svgCode: shadcnLogo }
              },
              {
                label: 'Playwright',
                url: 'https://playwright.dev',
                logo: { source: 'svg', svgCode: playwrightLogo }
              },
              {
                label: 'Storybook',
                url: 'https://storybook.js.org',
                icon: 'storybook'
              },
              { label: 'Sentry', url: 'https://sentry.io', icon: 'sentry' },
              {
                label: 'Turnstile',
                url: 'https://www.cloudflare.com/products/turnstile/',
                icon: 'cloudflare'
              },
              {
                label: 'Umami',
                url: 'https://umami.is',
                logo: { source: 'svg', svgCode: umamiLogo }
              },
              {
                label: 'GitHub',
                url: 'https://github.com/codeware-sthlm/cdwr',
                icon: 'github'
              }
            ]
          },
          {
            blockType: 'callout',
            blockName: 'Get started',
            showMark: true,
            markStyle: 'muted',
            heading: 'Build on the same platform',
            band: 'subtle',
            body: 'The Nx plugin this platform started from is published, with a preset that starts a Payload workspace of your own.',
            link: { type: 'custom', url: '/start', label: 'Get started' }
          }
        ]
      },

      // ── The gallery: route chrome built from the registry ──────────────────
      {
        name: 'Blocks',
        slug: 'blocks',
        meta: {
          title: 'Block gallery',
          description:
            'Every block a page can be built from, drawn by the same component a site uses, with a note on when to use it.'
        },
        layout: [
          {
            blockType: 'block-gallery',
            blockName: 'All blocks',
            eyebrow: 'Block gallery',
            heading: 'Every block a page can be built from',
            intro:
              'Each example is drawn by the same component a site uses, in the theme you have chosen. Open a block to see its fields and when to use it.',
            mode: 'index'
          }
        ]
      },

      // ── The other pages: tell it plainly ───────────────────────────────────
      {
        name: 'Studio',
        slug: 'studio',
        meta: {
          title: 'A theme you cannot save until it is readable',
          description:
            'Pick a brand colour. The studio derives every other colour from it and checks each pairing for readability while you work.'
        },
        layout: [
          {
            blockType: 'hero',
            blockName: 'Intro',
            badge: 'Theme studio',
            heading: 'A theme you cannot save until it is readable',
            lede: 'Pick a brand colour. The studio derives every other colour from it and checks each pairing for readability while you work. A theme that fails cannot be published.'
          },
          {
            // What the fact cards below leave out: the rule that makes the claim
            blockType: 'feature-section',
            blockName: 'How readability is checked',
            eyebrow: 'Readability',
            heading: 'How readability is checked',
            band: 'subtle',
            illustration: contrastIllustration,
            intro:
              'The studio builds a theme from a few choices and measures the contrast between each colour and the colour behind it.',
            subFeatures: [
              {
                title: 'Measured while you work',
                body: 'Each pairing is checked against the accessibility standard every time the theme changes.'
              },
              {
                title: '4.5:1 for text, 3:1 for large headings',
                body: 'These are the contrast levels the WCAG standard sets. Every pair of colours a visitor reads has to reach them.'
              },
              {
                title: 'Saving stays off until it passes',
                body: 'While any pair is below these levels the theme cannot be saved, so it never reaches a visitor.'
              }
            ]
          },
          {
            // The prose above has already said what this is, so no header —
            // just the studio, opened on the theme this site runs
            blockType: 'theme-studio',
            blockName: 'The studio',
            startFrom: 'spotlight',
            note: 'This is the real studio. Nothing you do here leaves your browser.'
          },
          {
            blockType: 'feature-cards',
            blockName: 'Guarantees',
            eyebrow: 'Saved themes',
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
        name: 'Components',
        slug: 'components',
        meta: {
          title: 'A component written in the admin',
          description:
            'When no block does what a page needs, a developer writes one in the component studio. Saving it starts a build, and an editor places it on a page.'
        },
        layout: [
          {
            blockType: 'hero',
            blockName: 'Intro',
            badge: 'Custom components',
            heading: 'A component written in the admin',
            lede: 'When no block does what a page needs, a developer writes one in the component studio. Saving it starts a build, and once the build is done an editor places it on a page like any other block.'
          },
          {
            blockType: 'feature-section',
            blockName: 'From code to page',
            eyebrow: 'How it works',
            heading: 'From code to page',
            band: 'subtle',
            intro:
              'A component is code written in the admin and needs no release. Only the site it belongs to can use it.',
            subFeatures: [
              {
                title: 'Written in the admin',
                body: 'The studio type-checks against the same declarations the build uses, so a mistake shows while you type.'
              },
              {
                title: 'Built on save',
                body: 'Saving starts a build of the component, and a page shows it once the build has finished.'
              },
              {
                title: 'Placed by an editor',
                body: 'It is a block with its own fields, so putting it on a page needs no code and no release.'
              }
            ]
          },
          {
            blockType: 'custom-component',
            blockName: 'Theme swatch',
            component: { lookupSlug: 'theme-swatch' },
            props: {
              title: 'The colours on this page',
              description: 'Read from the active theme as it changes'
            }
          },
          {
            blockType: 'code',
            blockName: 'Swatch source',
            heading: 'The source of the component above',
            intro:
              'This is the code behind the colours shown above, as it was written in the component studio.',
            language: 'tsx',
            code: cdwrIoThemeSwatchSource,
            visibleLines: 14
          },
          {
            blockType: 'feature-cards',
            blockName: 'Limits',
            eyebrow: 'Limits',
            heading: 'What a component can and cannot do',
            columns: '2',
            items: [
              {
                title: 'A fixed set of packages',
                description:
                  "It can import React, the site's own primitives, and `lucide-react`, `class-variance-authority`, `react-hook-form`, `zod` and `recharts`. Any other package fails the build."
              },
              {
                title: 'Runs in the browser',
                description:
                  'It renders in the visitor’s browser, not on the server. It cannot read the database or a secret, only what the page and its props give it.'
              },
              {
                title: 'Belongs to one site',
                description:
                  'A component lives in the site that wrote it. Another site does not see it, cannot place it, and cannot break it.'
              },
              {
                title: 'Typed props',
                description:
                  'Its fields are declared with it, so an editor fills in a form instead of writing props.'
              }
            ]
          },
          {
            blockType: 'callout',
            blockName: 'Get a site',
            showMark: true,
            markStyle: 'muted',
            heading: 'Write a component on your own site',
            band: 'subtle',
            body: 'The component studio comes with a site on the platform, and we turn it on for the site’s developer. Signup is by invitation for now.',
            link: { type: 'custom', url: '/start', label: 'Get a site' }
          }
        ]
      },
      {
        name: 'Architecture',
        slug: 'architecture',
        meta: {
          title: 'Every site is its own deployment',
          description:
            'A site is an app of its own, on its own domain, with its own certificate and its own secrets, hosted in Stockholm, in the EU.'
        },
        layout: [
          {
            blockType: 'hero',
            blockName: 'Intro',
            badge: 'Architecture',
            heading: 'Every site is its own deployment',
            lede: 'Each site runs as an app of its own, on its own domain, with its own certificate and secrets. All of them are hosted in Stockholm, in the EU.'
          },
          {
            blockType: 'feature-section',
            blockName: 'Two blueprints',
            eyebrow: 'Two kinds of app',
            heading: 'Two blueprints, one renderer',
            band: 'subtle',
            intro:
              'Every site runs as an app started from one of two blueprints, each for its own purpose. Both draw their pages with the same content renderer, which is plain React and knows nothing of the framework around it.',
            subFeatures: [
              {
                title: 'The `cms` app',
                body: 'A classic Payload deployment on Next.js: a site and its own admin in one app. Run as a host instead, it serves the content for every `headless` site, and their editors work in its admin. Ours is `cms.cdwr.io`.'
              },
              {
                title: 'The `headless` app',
                body: 'The platform’s own addition, built on TanStack Start. A site’s app serves only the site, and reads its content from the host over its REST API.'
              },
              {
                title: 'Room for more',
                body: 'Since the renderer is not tied to a framework, another React framework can become a third blueprint without changing how content is drawn.'
              }
            ]
          },
          {
            blockType: 'feature-section',
            blockName: 'One build per app',
            eyebrow: 'One build per app',
            heading: 'Built once, started for every site',
            illustration: oneBuildIllustration,
            intro:
              'Each blueprint is built once when a change is merged, and that build is started for every site that runs on it.',
            subFeatures: [
              {
                title: 'Told who it is when it is deployed',
                body: 'Nothing about a site is in the build. Its app gets its tenant and its secrets from the deploy, and Fly.io holds the certificate for its domain.'
              },
              {
                title: 'One database, kept apart',
                body: 'The sites share one database, and the platform keeps each site to its own content.'
              },
              {
                title: 'The same software, twice',
                body: '`codeware.se` and `cdwr.io` run the same `cms` build. A third site would run it too, with its own domain, content and theme.'
              }
            ]
          },
          {
            blockType: 'feature-section',
            blockName: 'Security',
            band: 'subtle',
            eyebrow: 'Security',
            heading: 'Who gets in, and what they can reach',
            intro:
              'Editors sign in with Payload’s own login, which locks an account for a day after five wrong passwords, and then with a one-time code from an authenticator app (TOTP). The code is required for the platform’s administrators and for each site’s admins, and any other editor can turn it on.',
            subFeatures: [
              {
                title: 'Each site sees its own content',
                body: 'A site’s app reads with its own API key, and the `cms` app answers with that site’s content only. A `headless` app’s requests must be signed as well.'
              },
              {
                title: 'A member area',
                body: 'Pages can be for the site’s members only. The `cms` app holds them back, so a visitor who is not signed in, and a search engine, never gets them.'
              },
              {
                title: 'A policy for the browser',
                body: 'Every page sends a Content Security Policy, so the browser runs only the scripts the page was sent with and loads only from the sources the site lists.'
              },
              {
                title: 'Limits on every way in',
                body: 'Sign-in, signup and the password gate a site can keep until launch are limited per address, and forms can ask Cloudflare Turnstile whether a person sent them.'
              }
            ]
          },
          {
            blockType: 'feature-section',
            blockName: 'Privacy',
            eyebrow: 'Privacy',
            heading: 'Built with the GDPR in mind',
            intro:
              'Sites are hosted in the EU, visitors are not tracked, and each site’s privacy page starts from what its deployment actually runs.',
            subFeatures: [
              {
                title: 'Hosted in the EU',
                body: 'Sites, and the details visitors send through them, are stored with hosting providers in the EU.'
              },
              {
                title: 'No cookie banner',
                body: 'Visitor statistics set no cookies and store no IP address. The only cookies keep the theme and mode a visitor picks.'
              },
              {
                title: 'Errors without the person',
                body: 'Error reports go to Sentry in the EU, without the visitor’s IP address or anything they typed.'
              },
              {
                title: 'A privacy page that matches',
                body: 'An editor starts the privacy page from a template filled in from the services the site’s deployment runs, in English or Swedish.'
              }
            ]
          },
          {
            blockType: 'feature-cards',
            blockName: 'Deploys',
            band: 'subtle',
            eyebrow: 'Deployment',
            heading: 'A release takes traffic once it is healthy',
            columns: '3',
            items: [
              {
                title: 'Blue-green deploys',
                description:
                  'The `cms` and `headless` apps start a new release beside the running one. Traffic moves over only when the new release passes its health check, so a release that fails to start never takes traffic.'
              },
              {
                title: 'A health check that asks the app',
                description:
                  'Fly.io keeps asking each app whether it is up. The `cms` app answers yes only when Payload has started and the database answers a query.'
              },
              {
                title: 'Migrations in two steps',
                description:
                  'A schema change adds first and removes in a later release. A migration that drops or renames a column must say why no running release still reads it, and a test enforces that.'
              }
            ]
          },
          {
            blockType: 'feature-cards',
            blockName: 'Pull request previews',
            eyebrow: 'Pull requests',
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
                title: 'Screenshots of the components',
                description:
                  'A pull request can take screenshots of every component in every theme and show what changed.'
              }
            ]
          },
          {
            // The same tools in the same order as Home's list
            blockType: 'feature-cards',
            blockName: 'Stack',
            band: 'subtle',
            eyebrow: 'Built on',
            heading: 'What it is built on, and why',
            columns: '3',
            logoColor: 'own',
            items: [
              {
                brand: { tech: 'payload' },
                title: 'Payload',
                description:
                  'The editor and the content API. Open source, and the whole admin is code we can change.'
              },
              {
                brand: { tech: 'nextjs' },
                title: 'Next.js',
                description:
                  'Runs the `cms` app, which serves a site’s pages and its admin from one app.'
              },
              {
                brand: { logo: { source: 'svg', svgCode: tanstackLogo } },
                title: 'TanStack Start',
                description:
                  'Runs the `headless` app, which serves only the site and reads its content from the `cms` host.'
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
                brand: { logo: { source: 'svg', svgCode: infisicalLogo } },
                title: 'Infisical',
                description:
                  'Holds every secret, one folder per site, so nothing lives in the repository.'
              },
              {
                brand: { logo: { source: 'svg', svgCode: nxLogo } },
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
                brand: { logo: { source: 'svg', svgCode: shadcnLogo } },
                title: 'shadcn/ui',
                description:
                  'The components the blocks and the admin start from. They take their colours from the theme, so one theme reaches both.'
              },
              {
                brand: { logo: { source: 'svg', svgCode: playwrightLogo } },
                title: 'Playwright',
                description: 'The tests that open the running site and use it.'
              },
              {
                brand: { tech: 'storybook' },
                title: 'Storybook',
                description:
                  'Every component in every theme, in one place. The screenshots a pull request takes come from here.'
              },
              {
                brand: { tech: 'sentry' },
                title: 'Sentry',
                description:
                  'Collects the errors every site and app runs into, so a fault is seen before a visitor reports it.'
              },
              {
                brand: { tech: 'cloudflare' },
                title: 'Turnstile',
                description:
                  'Tells a person from a script on signup and forms, without a puzzle to solve.'
              },
              {
                brand: { logo: { source: 'svg', svgCode: umamiLogo } },
                title: 'Umami',
                description:
                  'Site statistics without cookies. Each site has its own team, so its admins see only their own numbers.'
              },
              {
                brand: { tech: 'github' },
                title: 'GitHub',
                description:
                  'The source, the pull requests and the workflows that test, preview and deploy every change.'
              }
            ]
          },
          {
            // How the list above fits together, run from the platform's own
            // command line. Named, but not offered: it is not published
            blockType: 'feature-section',
            blockName: 'The cdwr CLI',
            eyebrow: 'Operations',
            heading: 'One tool runs the platform',
            intro:
              'A merged change becomes a running site with its own secrets, data lives in one database and errors are watched. All of it is operated from `cdwr`, the platform’s own command line, which shows what it will do before it does it.',
            illustration: stackIllustration,
            subFeatures: [
              {
                title: 'Deploys',
                body: 'Deploys the apps to Fly.io, scales them and restarts them.'
              },
              {
                title: 'Sites',
                body: 'Creates a site’s workspace, sets up its secrets and its API key, and applies a site definition like the one behind this page.'
              },
              {
                title: 'Statistics and errors',
                body: 'Gives each site its own Umami team, checks who may read it, and reports the errors Sentry has collected.'
              }
            ]
          }
        ]
      },
      ...(devlog ? [devlogPage] : []),
      {
        name: 'Get started',
        slug: 'start',
        meta: {
          title: 'Get a site on the platform',
          description:
            'The platform hosts a small number of sites, by invitation. Or start a workspace of your own from the published packages.'
        },
        layout: [
          {
            blockType: 'hero',
            blockName: 'Intro',
            badge: 'Get started',
            heading: 'Get a site on the platform',
            lede: 'The platform hosts a small number of sites, so signup is limited and by invitation. With an invite code you create a workspace, choose a starter and have a site live without running anything yourself.',
            illustration: startIllustration
          },
          {
            blockType: 'feature-cards',
            blockName: 'Hosted steps',
            eyebrow: 'Hosted',
            band: 'subtle',
            heading: 'From invite code to live site',
            intro:
              'There is room for a few more sites, and an invite code is how each new site gets in.',
            columns: '2',
            items: [
              {
                title: '1. Get an invite code',
                description: 'A code lets you create an account.'
              },
              {
                title: '2. Sign up',
                description:
                  'Enter the code on the signup page and create your account.'
              },
              {
                title: '3. Follow the first-site guide',
                description:
                  'The guide applies a starter to your workspace: pages, theme and footer you can edit afterwards.'
              },
              {
                title: '4. We set it up, and it goes live',
                description:
                  'We provision the site. It runs as its own app, apart from every other site.'
              }
            ]
          },
          {
            // On the band above, so hosted and self-built read as one choice
            blockType: 'content',
            blockName: 'Build your own',
            band: 'subtle',
            columns: [
              {
                size: 'full',
                richText: {
                  markdown:
                    '## Or build your own\n\nThe Nx plugin this platform started from is published, with a preset for a new workspace. The command below creates an Nx workspace with one Payload app, and the last line starts it with its database in Docker. That is a starting point, far from what the platform does. `payload-admin` is the app name the setup suggests.'
                },
                blocks: [
                  {
                    blockType: 'code',
                    language: 'shell',
                    code: [
                      'npx create-nx-payload@latest my-platform',
                      'cd my-platform',
                      'npx nx dx:start payload-admin'
                    ].join('\n')
                  }
                ]
              }
            ]
          },
          {
            blockType: 'feature-cards',
            blockName: 'Published packages',
            eyebrow: 'Three packages, published',
            heading: 'Usable on their own, without adopting anything else here',
            columns: '3',
            logoColor: 'own',
            items: [
              {
                brand: { logo: { source: 'svg', svgCode: nxLogo } },
                title: '`@cdwr/nx-payload`',
                description:
                  'An Nx plugin adding Payload generators and executors to any workspace. Scaffold an app, run migrations, build for deploy.'
              },
              {
                brand: { tech: 'payload' },
                title: '`create-nx-payload`',
                description:
                  'The preset behind the command above: a new Nx workspace with one Payload app, ready to run locally.'
              },
              {
                brand: { tech: 'flyio' },
                title: '`@cdwr/fly-node`',
                description:
                  'A programmatic Node wrapper around the Fly CLI. What the deployment tooling here is built on.'
              }
            ]
          },
          {
            blockType: 'callout',
            blockName: 'Source',
            showMark: true,
            markStyle: 'muted',
            heading: 'The source is open',
            band: 'subtle',
            body: 'Read how it is built, follow along as it changes, or open an issue when something does not work the way this site says it does.',
            link: {
              type: 'custom',
              url: 'https://github.com/codeware-sthlm/cdwr',
              label: 'Open the repository',
              newTab: true
            }
          }
        ]
      },
      {
        name: 'Privacy',
        slug: 'privacy',
        layout: [
          {
            blockType: 'content',
            blockName: 'Privacy policy',
            columns: [
              { size: 'full', richText: { markdown: cdwrIoPrivacyMarkdown } }
            ]
          }
        ]
      }
    ],

    customComponents: [
      {
        name: 'Theme swatch',
        slug: 'theme-swatch',
        source: cdwrIoThemeSwatchSource,
        propsSchema: [
          { name: 'title', type: 'text', required: true },
          { name: 'description', type: 'text' },
          { name: 'tokens', type: 'textarea' }
        ]
      }
    ],

    navigation: [
      {
        label: 'Platform',
        children: [
          {
            reference: { relationTo: 'pages', lookupSlug: 'blocks' },
            label: 'Blocks'
          },
          {
            reference: { relationTo: 'pages', lookupSlug: 'studio' },
            label: 'Studio'
          },
          {
            reference: { relationTo: 'pages', lookupSlug: 'components' },
            label: 'Components'
          },
          {
            reference: { relationTo: 'pages', lookupSlug: 'architecture' },
            label: 'Architecture'
          }
        ]
      },
      ...(devlog
        ? [
            {
              reference: { relationTo: 'pages' as const, lookupSlug: 'devlog' },
              label: 'Devlog'
            }
          ]
        : []),
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
        icon: { source: 'svg', svgCode: cdwrCloudSvg },
        iconStyle: 'muted',
        // Every built-in beside its own: here the theme switch is the demo
        themes: [
          'frost',
          'spotlight',
          'codeware',
          'archipelago',
          'midsummer',
          'lingon',
          'granite',
          'aurora',
          'cement'
        ],
        customThemes: [{ lookupSlug: 'cdwr' }],
        defaultTheme: 'cdwr'
      },
      // The legal pages are linked by the legal settings, not listed here.
      // The footer carries the navigation, which the header leaves out
      footer: {
        variant: 'expanded',
        linkSource: 'navigation',
        licence: 'FSL-1.1-MIT',
        licenceUrl:
          'https://github.com/codeware-sthlm/cdwr/blob/main/LICENSING.md',
        contact: [
          { platform: 'email', email: 'hello@codeware.se' },
          { platform: 'github', url: 'https://github.com/codeware-sthlm' },
          { platform: 'npm', url: 'https://www.npmjs.com/org/cdwr' }
        ],
        showCopyright: true,
        copyright: '© {year} Codeware Sthlm AB',
        // The platform shows its own release line
        showVersion: true,
        backToTop: true
      },
      legal: {
        privacyPage: { lookupSlug: 'privacy' }
      }
    }
  };
}

/** On: the agent drafts the entries and Håkan publishes them one by one */
const devlog = true;

export const cdwrIo = defineCdwrIo({ devlog });

export default cdwrIo;
