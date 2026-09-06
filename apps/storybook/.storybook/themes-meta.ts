/* AUTO-GENERATED — do not edit manually. Run `pnpm nx sync` to update. */

export type SbTheme = (typeof STORYBOOK_THEMES)[number];
export type ThemeDarkStrategy = 'class' | 'attribute';

export const STORYBOOK_THEMES = [
  'shadcn',
  'payload-admin',
  'spotlight',
  'spotlight-fork',
  'codeware'
] as const;

export const THEME_DARK_STRATEGIES = {
  shadcn: 'class',
  'payload-admin': 'attribute',
  spotlight: 'class',
  'spotlight-fork': 'class',
  codeware: 'class'
} as const satisfies Record<SbTheme, ThemeDarkStrategy>;

export const SHADCN_TOKENS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--border',
  '--input',
  '--ring',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5'
] as const;
export const SIDEBAR_TOKENS = [
  '--sidebar',
  '--sidebar-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-border',
  '--sidebar-ring'
] as const;
export const BRAND_TOKENS = [
  '--brand-50',
  '--brand-100',
  '--brand-200',
  '--brand-300',
  '--brand-400',
  '--brand-500',
  '--brand-600',
  '--brand-700',
  '--brand-800',
  '--brand-900',
  '--brand-950'
] as const;
export const CORE_TOKENS = [
  '--core-action-btn-foreground',
  '--core-action-btn-foreground-hover',
  '--core-action-btn-background',
  '--core-action-btn-border',
  '--core-action-btn-border-hover',
  '--core-action-btn-icon-fill',
  '--core-action-btn-shadow',
  '--core-background-body',
  '--core-background-content',
  '--core-content-border',
  '--core-header',
  '--core-headline',
  '--core-interactive',
  '--core-link',
  '--core-navbar',
  '--core-navbar-border',
  '--core-navbar-shadow',
  '--core-nav-link',
  '--core-nav-link-active',
  '--core-nav-link-hover',
  '--core-surface-invert',
  '--core-text',
  '--core-font-body',
  '--core-font-heading',
  '--core-font-mono'
] as const;
export const PROSE_TOKENS = [
  '--body',
  '--bold',
  '--bullets',
  '--captions',
  '--code',
  '--code-bg',
  '--counters',
  '--headings',
  '--hr',
  '--links',
  '--links-hover',
  '--pre-bg',
  '--pre-border',
  '--pre-code',
  '--quote-borders',
  '--td-borders',
  '--th-borders',
  '--underline',
  '--underline-hover'
] as const;
