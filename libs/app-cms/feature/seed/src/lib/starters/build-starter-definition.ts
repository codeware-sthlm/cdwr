import { renderLegalTemplate } from '@codeware/app-cms/util/content-templates';
import {
  type BlockDefinition,
  type NavigationItemDefinition,
  type PageDefinition,
  type SiteDefinition,
  codewareHeroIllustration
} from '@codeware/shared/util/seed';

import { STARTER_COPY } from './starter-copy';
import {
  STARTER_PAGES,
  type StarterAnswers,
  type StarterPage
} from './starter-types';

/** Home first, then the chosen pages in this order, whatever order was asked */
const NAVIGATION_PAGES = STARTER_PAGES.filter((page) => page !== 'privacy');

const pageLink = (lookupSlug: string): NavigationItemDefinition => ({
  reference: { relationTo: 'pages', lookupSlug }
});

/**
 * A small first site, stated as data from a handful of answers.
 *
 * Pure: the same answers give the same definition. Placeholder copy invites
 * editing, and the definition carries no media and no identity.
 */
export function buildStarterDefinition(
  answers: StarterAnswers
): SiteDefinition {
  const { purpose, theme, appName, email, locale } = answers;
  const copy = STARTER_COPY[locale];
  const chosen = new Set<StarterPage>(answers.pages);
  const purposeCopy = copy.purposes[purpose];

  const homeLayout: Array<BlockDefinition> = [
    {
      blockType: 'hero',
      heading: appName,
      lede: purposeCopy.lede,
      // Drawn for codeware.se, whose Swedish label would mislead an English site
      illustration: codewareHeroIllustration.replace(
        /aria-label="[^"]*"/,
        `aria-label="${copy.illustrationLabel}"`
      ),
      ...(chosen.has('contact') && {
        actions: [
          {
            link: {
              type: 'custom',
              url: '/contact',
              label: copy.contactAction,
              newTab: false
            },
            emphasis: 'primary'
          }
        ]
      })
    },
    {
      blockType: 'feature-cards',
      eyebrow: purposeCopy.cardsEyebrow,
      band: 'subtle',
      heading: purposeCopy.cardsHeading,
      intro: purposeCopy.cardsIntro,
      columns: '3',
      items: purposeCopy.cards
    },
    ...(purposeCopy.join
      ? [
          {
            blockType: 'content',
            columns: [
              { size: 'full', richText: { markdown: purposeCopy.join } }
            ]
          } satisfies BlockDefinition
        ]
      : [])
  ];

  const pages: Array<PageDefinition> = [
    { name: copy.pageNames.home, slug: 'home', draft: true, layout: homeLayout }
  ];

  if (chosen.has('about')) {
    pages.push({
      name: copy.pageNames.about,
      slug: 'about',
      draft: true,
      layout: [
        {
          blockType: 'content',
          columns: [
            { size: 'full', richText: { markdown: copy.about[purpose] } }
          ]
        }
      ]
    });
  }

  if (chosen.has('news')) {
    pages.push({
      name: copy.pageNames.news,
      slug: 'news',
      draft: true,
      layout: [
        {
          blockType: 'posts',
          title: copy.news.heading,
          description: copy.news.intro,
          limit: 6
        }
      ]
    });
  }

  if (chosen.has('contact')) {
    pages.push({
      name: copy.pageNames.contact,
      slug: 'contact',
      draft: true,
      layout: [
        {
          blockType: 'form',
          form: { lookupTitle: copy.contact.form.title },
          enableIntro: true,
          introContent: { markdown: copy.contact.intro }
        }
      ]
    });
  }

  if (chosen.has('privacy')) {
    // No public address is known, so the template's fill-in marker stands
    const { markdown, title } = renderLegalTemplate('privacy', locale, {
      ...answers.privacy,
      tenantName: appName,
      contactEmail: ''
    });
    pages.push({
      name: title,
      slug: 'privacy',
      draft: true,
      layout: [
        {
          blockType: 'content',
          columns: [{ size: 'full', richText: { markdown } }]
        }
      ]
    });
  }

  return {
    name: `starter:${purpose}`,
    description: `Starter site for a ${purpose}`,
    ...(chosen.has('contact') && {
      forms: [{ ...copy.contact.form, emailTo: email }]
    }),
    pages,
    ...(chosen.has('news') && {
      posts: [
        {
          title: copy.news.postTitle,
          slug: 'welcome',
          draft: true,
          content: copy.news.postContent
        }
      ]
    }),
    // Privacy is linked from the footer through the legal settings
    navigation: [
      pageLink('home'),
      ...NAVIGATION_PAGES.filter((page) => chosen.has(page)).map(pageLink)
    ],
    siteSettings: {
      general: {
        appName,
        landingPage: { lookupSlug: 'home' },
        defaultLocale: locale,
        themes: [theme],
        defaultTheme: theme,
        colorScheme: 'system',
        chrome: 'flat'
      },
      footer: {
        enabled: true,
        variant: 'standard',
        linkSource: 'navigation',
        tagline: copy.footerTagline[purpose],
        showCopyright: true,
        showVersion: false
      },
      ...(chosen.has('privacy') && {
        legal: { privacyPage: { lookupSlug: 'privacy' } }
      })
    }
  };
}
