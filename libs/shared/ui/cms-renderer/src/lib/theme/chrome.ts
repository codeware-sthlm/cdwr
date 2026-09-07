import { cva } from 'class-variance-authority';

/**
 * How the header and its controls are drawn.
 *
 * One decision for three components — the navigation, the theme select and the
 * colour scheme switch. A flat navigation carrying outlined toggles is the one
 * combination nobody wants, so the value comes from context and the classes
 * come from here rather than being written out at each site.
 *
 * `outlined` is what every site rendered before the setting existed: a ring
 * and a shadow lift the control off the page. `flat` removes both and leans on
 * the surface, which is quieter but has less to hold on to — it is defined by
 * what it takes away, so it wants checking on a pale theme rather than only a
 * dark one.
 *
 * Written as `cva` rather than plain strings so the editor treats these as
 * classes: `.vscode/settings.json` gives `cva`, `cn` and `cx` a class regex,
 * and nothing outside those three gets completion or hover.
 */
export type Chrome = 'flat' | 'outlined';

/**
 * A pill control in the header — either toggle.
 *
 * Both toggles carried the same class string, character for character. They
 * take it from here now, so a change to one is a change to both.
 */
export const controlChrome = cva(
  'group rounded-full px-3 py-2 backdrop-blur transition',
  {
    variants: {
      chrome: {
        flat: 'bg-core-action-btn-background/70 hover:bg-core-action-btn-background',
        outlined:
          'bg-core-action-btn-background shadow-core-action-btn-shadow ring-core-action-btn-border hover:ring-core-action-btn-border-hover shadow-lg ring-1'
      }
    },
    defaultVariants: { chrome: 'outlined' }
  }
);

/** The desktop navigation bar itself. */
export const navChrome = cva(
  'text-core-nav-link flex h-full rounded-full px-3 text-sm font-medium backdrop-blur transition',
  {
    variants: {
      chrome: {
        flat: 'bg-core-navbar/70',
        outlined:
          'bg-core-navbar shadow-core-navbar-shadow ring-core-navbar-border shadow-lg ring-1'
      }
    },
    defaultVariants: { chrome: 'outlined' }
  }
);

/** The mobile navigation trigger, which is a pill like the toggles. */
export const mobileNavChrome = cva(
  'group text-core-nav-link flex h-full items-center rounded-full object-contain px-4 py-2 text-sm font-medium backdrop-blur transition',
  {
    variants: {
      chrome: {
        flat: 'bg-core-navbar/70 hover:bg-core-navbar',
        outlined:
          'bg-core-navbar shadow-core-action-btn-shadow ring-core-action-btn-border hover:ring-core-action-btn-border-hover shadow-lg ring-1'
      }
    },
    defaultVariants: { chrome: 'outlined' }
  }
);
