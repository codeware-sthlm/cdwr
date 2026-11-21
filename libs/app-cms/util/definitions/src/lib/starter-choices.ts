export const STARTER_PURPOSES = [
  'business',
  'portfolio',
  'association'
] as const;
export type StarterPurpose = (typeof STARTER_PURPOSES)[number];

/** Home is always included, so it is not a choice */
export const STARTER_PAGES = ['about', 'contact', 'news', 'privacy'] as const;
export type StarterPage = (typeof STARTER_PAGES)[number];
