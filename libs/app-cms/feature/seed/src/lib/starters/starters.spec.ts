import { SITE_THEMES } from '@codeware/shared/theme';
import { SiteDefinitionSchema } from '@codeware/shared/util/seed';

import { buildStarterDefinition } from './build-starter-definition';
import {
  STARTER_LOCALES,
  STARTER_PAGES,
  STARTER_PURPOSES,
  type StarterAnswers,
  type StarterPage
} from './starter-types';

const privacy: StarterPrivacyFacts = {
  tourSignups: false,
  tourRetentionDays: 365,
  formsRetentionDays: null,
  humanCheck: false,
  sendgrid: false,
  errorMonitoring: false,
  errorMonitoringEu: false,
  analytics: false
};

const themes = [SITE_THEMES[0], SITE_THEMES[2]];

const subsets = (
  pages: ReadonlyArray<StarterPage>
): Array<Array<StarterPage>> =>
  pages.reduce<Array<Array<StarterPage>>>(
    (acc, page) => [...acc, ...acc.map((subset) => [...subset, page])],
    [[]]
  );

const allAnswers: Array<StarterAnswers> = STARTER_PURPOSES.flatMap((purpose) =>
  subsets(STARTER_PAGES).flatMap((pages) =>
    STARTER_LOCALES.flatMap((locale) =>
      themes.map((theme) => ({
        purpose,
        pages,
        theme,
        appName: 'Acme',
        email: 'owner@acme.test',
        privacy,
        locale
      }))
    )
  )
);

const label = (a: StarterAnswers) =>
  `${a.purpose} [${a.pages.join(',')}] ${a.locale} ${a.theme}`;

describe('buildStarterDefinition', () => {
  it('covers every combination', () => {
    expect(allAnswers).toHaveLength(3 * 16 * 2 * 2);
  });

  it.each(allAnswers.map((a) => [label(a), a] as const))(
    'is a valid definition: %s',
    (_, answers) => {
      const definition = buildStarterDefinition(answers);
      const result = SiteDefinitionSchema.safeParse(definition);

      if (!result.success) {
        throw new Error(JSON.stringify(result.error.issues, null, 2));
      }

      expect(definition.name).toBe(`starter:${answers.purpose}`);
      expect(definition.media).toBeUndefined();

      // Home plus exactly the chosen pages
      expect(definition.pages.map((p) => p.slug).sort()).toEqual(
        ['home', ...answers.pages].sort()
      );
      expect(definition.siteSettings?.general?.landingPage).toEqual({
        lookupSlug: 'home'
      });

      // Home first, then the chosen pages in a fixed order, never privacy
      const expectedNav = [
        'home',
        ...STARTER_PAGES.filter(
          (p) => p !== 'privacy' && answers.pages.includes(p)
        )
      ];
      expect(
        definition.navigation?.map((item) =>
          'reference' in item ? item.reference.lookupSlug : item.label
        )
      ).toEqual(expectedNav);

      expect(definition.siteSettings?.legal?.privacyPage?.lookupSlug).toBe(
        answers.pages.includes('privacy') ? 'privacy' : undefined
      );

      expect(definition.forms?.map((f) => f.emailTo)).toEqual(
        answers.pages.includes('contact') ? [answers.email] : undefined
      );
      expect(definition.posts?.length).toBe(
        answers.pages.includes('news') ? 1 : undefined
      );

      const general = definition.siteSettings?.general;
      expect(general?.themes).toEqual([answers.theme]);
      expect(general?.defaultTheme).toBe(answers.theme);
      expect(general?.appName).toBe(answers.appName);
      expect(definition.siteSettings?.footer?.contact).toBeUndefined();

      // The email is only ever a form recipient, never published text
      const published = JSON.stringify({ ...definition, forms: undefined });
      expect(published).not.toContain(answers.email);

      const home = definition.pages.find((p) => p.slug === 'home');
      expect(home?.layout[0]).toMatchObject({
        blockType: 'hero',
        heading: answers.appName
      });
    }
  );

  it('creates everything as a draft for the editor to review', () => {
    for (const answers of allAnswers) {
      const { pages, posts = [] } = buildStarterDefinition(answers);
      expect([...pages, ...posts].every((doc) => doc.draft === true)).toBe(
        true
      );
    }
  });

  it("labels the illustration in the site's language", () => {
    const [answers] = allAnswers;
    const label = (locale: 'en' | 'sv') => {
      const [hero] = buildStarterDefinition({ ...answers, locale }).pages[0]
        .layout;
      return JSON.stringify(hero).match(/aria-label=\\"([^\\]*)\\"/)?.[1];
    };

    expect(label('en')).toMatch(/^Ideas in orbit/);
    expect(label('sv')).toMatch(/^Idéer i omlopp/);
  });

  it('is the same for the same answers', () => {
    const [answers] = allAnswers;
    expect(buildStarterDefinition(answers)).toEqual(
      buildStarterDefinition(answers)
    );
  });

  it('does not depend on the order the pages were chosen in', () => {
    const base = allAnswers[0];
    const a = buildStarterDefinition({ ...base, pages: ['news', 'about'] });
    const b = buildStarterDefinition({ ...base, pages: ['about', 'news'] });
    expect(a.navigation).toEqual(b.navigation);
  });

  it.each(STARTER_PURPOSES)('has Swedish copy for %s', (purpose) => {
    const base = {
      purpose,
      pages: STARTER_PAGES,
      theme: themes[0],
      appName: 'Acme',
      email: 'owner@acme.test',
      privacy
    };
    const en = buildStarterDefinition({ ...base, locale: 'en' });
    const sv = buildStarterDefinition({ ...base, locale: 'sv' });

    expect(sv.pages).not.toEqual(en.pages);
    expect(sv.pages.map((p) => p.name)).not.toEqual(
      en.pages.map((p) => p.name)
    );
    expect(sv.pages.map((p) => p.slug)).toEqual(en.pages.map((p) => p.slug));
    expect(sv.forms).not.toEqual(en.forms);
    expect(sv.posts).not.toEqual(en.posts);
    expect(sv.siteSettings?.general?.defaultLocale).toBe('sv');
  });

  describe('privacy page', () => {
    const base: StarterAnswers = {
      purpose: 'business',
      pages: ['privacy'],
      theme: themes[0],
      appName: 'Acme',
      email: 'owner@acme.test',
      privacy,
      locale: 'en'
    };
    const markdownOf = (answers: StarterAnswers) =>
      JSON.stringify(
        buildStarterDefinition(answers).pages.find((p) => p.slug === 'privacy')
      );

    it('leaves the contact address as a fill-in marker', () => {
      expect(markdownOf(base)).toContain('[fill in a contact address]');
      expect(markdownOf({ ...base, locale: 'sv' })).toContain(
        '[fyll i en kontaktadress]'
      );
    });

    it('reflects the facts it is given', () => {
      expect(markdownOf(base)).not.toContain('Sentry');
      expect(
        markdownOf({ ...base, privacy: { ...privacy, errorMonitoring: true } })
      ).toContain('Sentry');
    });
  });
});
