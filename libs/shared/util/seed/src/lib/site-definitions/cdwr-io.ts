import type { SiteDefinition } from '../site-definition';

/**
 * `cdwr.io` — the platform showcase, as data.
 *
 * The governing idea from COD-475's content plan: **the showcase is the
 * product**. Every claim here is something a visitor can see working in the
 * page they are reading, rendered by the renderer that serves every tenant.
 * This file is itself part of that argument — the site is a document, applied
 * to a workspace, reviewable in a pull request.
 *
 * Copy is the content plan's draft. It is a proposal, not a final text.
 *
 * **Incomplete on purpose.** The home page and the block gallery are here
 * because they exercise the whole pipeline — blocks, media references, a form,
 * navigation. The remaining routes of the plan are not written yet.
 */
export const cdwrIo: SiteDefinition = {
  name: 'cdwr.io',
  description: 'The platform showcase — a live demo, not a description of one',

  forms: [
    {
      title: 'Contact',
      emailLabel: 'Your email',
      emailPlaceholder: 'you@example.com',
      submitLabel: 'Send',
      confirmation: 'Thank you — we will be in touch.',
      subject: 'New enquiry from cdwr.io'
    }
  ],

  pages: [
    {
      name: 'Home',
      slug: 'home',
      layout: [
        {
          blockType: 'hero',
          heading:
            'One image. Many sites. Each with its own domain, its own theme, and its own content.',
          lede: 'A multi-tenant CMS platform built on Payload and Next.js. This page is a tenant. So is the site next door, and it looks nothing like this one.',
          actions: [
            {
              link: { type: 'custom', url: '/blocks', label: 'See the blocks' },
              emphasis: 'primary'
            },
            {
              link: {
                type: 'custom',
                url: 'https://github.com/codeware-sthlm/cdwr',
                label: 'Read the source',
                newTab: true
              },
              emphasis: 'secondary'
            }
          ]
        },
        {
          blockType: 'feature-cards',
          eyebrow: 'What it does',
          heading: 'Four things, each of them demonstrable',
          columns: '2',
          items: [
            {
              title: 'Tenants are deployments',
              description:
                'Each tenant runs as its own app from one shared image, with its own domain and certificate. Isolation without a build per customer.'
            },
            {
              title: 'Themes are data',
              description:
                'A tenant picks its palette, its colour scheme and whether visitors may switch. Authored in the admin, not in a stylesheet.'
            },
            {
              title: 'Content is blocks',
              description:
                'Twenty composable blocks — prose, media, code, forms, tours — rendered by one renderer that every client shares.'
            },
            {
              title: 'Headless, and proven headless',
              description:
                'Two front ends consume the same API: Next.js and Remix. The second exists to keep the first honest.'
            }
          ]
        },
        {
          blockType: 'showcase',
          eyebrow: 'Theme studio',
          heading: 'A theme you cannot save until it is readable',
          intro:
            'Pick a brand colour and the studio derives the whole theme — surfaces, borders, charts, prose. Every pairing is checked against WCAG AA as you go, and a theme that fails cannot be published.',
          items: [
            {
              tag: 'Constraint',
              title: 'The randomiser cannot hand you an inaccessible theme',
              description:
                'It re-rolls until it finds a combination that passes, so the fun button stays safe.',
              link: { type: 'custom', url: '/blocks', label: 'See it' }
            }
          ]
        },
        {
          blockType: 'pill-list',
          eyebrow: 'Architecture',
          heading: 'Built on things worth building on',
          intro:
            'Every pull request gets a running site and a database of its own, provisioned per branch and torn down on merge — so a content change and a code change are reviewed the same way.',
          surface: 'dark',
          items: [
            { label: 'Payload', url: 'https://payloadcms.com' },
            { label: 'Next.js', url: 'https://nextjs.org' },
            { label: 'Remix', url: 'https://remix.run' },
            { label: 'Postgres', url: 'https://www.postgresql.org' },
            { label: 'Fly.io', url: 'https://fly.io' },
            { label: 'Nx', url: 'https://nx.dev' }
          ]
        },
        {
          blockType: 'posts',
          title: 'Devlog',
          description: 'Short entries when something ships.',
          limit: 5
        },
        {
          blockType: 'callout',
          showMark: true,
          heading: 'Start a Payload workspace with one command',
          body: '`npx create-nx-payload` scaffolds the same Nx and Payload setup this platform runs on. The plugin, the preset and the Fly wrapper are all on npm.',
          link: {
            type: 'custom',
            url: 'https://www.npmjs.com/package/@cdwr/create-nx-payload',
            label: 'On npm',
            newTab: true
          }
        },
        {
          blockType: 'form',
          form: { lookupTitle: 'Contact' },
          enableIntro: false
        }
      ]
    },
    {
      name: 'Blocks',
      slug: 'blocks',
      layout: [
        {
          blockType: 'block-gallery',
          eyebrow: 'Every block',
          heading: 'Rendered by the renderer that serves it',
          intro:
            'Not a gallery of screenshots. Each example below is the production component, drawing from the same content API a tenant site uses — so a block that renders badly under a theme is visible here, to everyone, immediately.',
          mode: 'index'
        }
      ]
    }
  ],

  navigation: [{ reference: { relationTo: 'pages', lookupSlug: 'blocks' } }],

  siteSettings: {
    general: {
      appName: 'cdwr.io'
    }
  }
};

export default cdwrIo;
