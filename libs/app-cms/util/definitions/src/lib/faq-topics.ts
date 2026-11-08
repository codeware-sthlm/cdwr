/**
 * The topics FAQ entries are grouped under in the admin help drawer, in the
 * order the drawer shows them. The first five follow the onboarding tour, so
 * a tour step and its FAQ group share one value.
 */
export const FAQ_TOPICS = [
  { value: 'pages', label: { en: 'Pages', sv: 'Sidor' } },
  {
    value: 'drafts',
    label: { en: 'Drafts & versions', sv: 'Utkast & versioner' }
  },
  { value: 'navigation', label: { en: 'Menu', sv: 'Menyn' } },
  {
    value: 'site-settings',
    label: { en: 'Site settings', sv: 'Webbplatsinställningar' }
  },
  { value: 'search-help', label: { en: 'Search & help', sv: 'Sök & hjälp' } },
  {
    value: 'account',
    label: { en: 'Account & sign-in', sv: 'Konto & inloggning' }
  },
  { value: 'statistics', label: { en: 'Statistics', sv: 'Statistik' } },
  { value: 'media', label: { en: 'Images & files', sv: 'Bilder & filer' } },
  {
    value: 'forms',
    label: { en: 'Forms & messages', sv: 'Formulär & meddelanden' }
  }
] as const;

export type FaqTopic = (typeof FAQ_TOPICS)[number]['value'];

export const isFaqTopic = (value: unknown): value is FaqTopic =>
  FAQ_TOPICS.some((topic) => topic.value === value);
