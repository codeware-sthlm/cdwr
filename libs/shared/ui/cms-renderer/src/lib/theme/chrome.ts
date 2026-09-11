import { cva } from 'class-variance-authority';

/**
 * How the header and its controls are drawn.
 *
 * One decision for three components — the navigation, the theme select and the
 * colour scheme switch. A flat navigation carrying outlined toggles is the one
 * combination nobody wants, so the value comes from context and the classes
 * come from here rather than being written out at each site.
 *
 * `outlined` is what every site rendered before the setting existed: **round,
 * ringed and lifted**. `flat` is **square and filled** — no ring, no shadow,
 * and where a control can show its options inline it does, rather than hiding
 * them behind an icon. The two differ in form and not only in trim, so they
 * stay apart in every state instead of converging whenever the ring is not
 * the thing being looked at.
 *
 * Written as `cva` rather than plain strings so the editor treats these as
 * classes: `.vscode/settings.json` gives `cva`, `cn` and `cx` a class regex,
 * and nothing outside those three gets completion or hover.
 */
export type Chrome = 'flat' | 'outlined';

/**
 * A control in the header — either toggle, or a segmented group's fallback.
 *
 * Both toggles carried the same class string, character for character. They
 * take it from here now, so a change to one is a change to both.
 */
export const controlChrome = cva(
  'group inline-flex items-center justify-center backdrop-blur transition',
  {
    variants: {
      chrome: {
        // Sized to the segment track it stands beside — `h-7` of segment plus
        // the track's own `p-0.5` — so a tenant past the segment limit does
        // not get one control taller than the other
        flat: 'bg-core-action-btn-track hover:bg-core-action-btn-background h-8 rounded-md px-2',
        outlined:
          'bg-core-action-btn-background shadow-core-action-btn-shadow ring-core-action-btn-border hover:ring-core-action-btn-border-hover rounded-full px-3 py-2 shadow-lg ring-1'
      }
    },
    defaultVariants: { chrome: 'outlined' }
  }
);

/** The icon inside one, which follows the box it sits in. */
export const controlIcon = cva(
  'stroke-core-action-btn-foreground fill-core-action-btn-icon-fill group-hover:stroke-core-action-btn-foreground-hover stroke-[1.5] transition',
  {
    variants: {
      chrome: { flat: 'size-4', outlined: 'size-6' }
    },
    defaultVariants: { chrome: 'outlined' }
  }
);

/** The desktop navigation bar itself. */
export const navChrome = cva(
  'text-core-nav-link flex h-full px-3 text-sm font-medium backdrop-blur transition',
  {
    variants: {
      chrome: {
        // Bare: no fill, no ring, no shadow. The links are the navigation
        flat: 'bg-transparent',
        outlined:
          'bg-core-navbar shadow-core-navbar-shadow ring-core-navbar-border rounded-full shadow-lg ring-1'
      }
    },
    defaultVariants: { chrome: 'outlined' }
  }
);

/** The mobile navigation trigger, which follows the toggles. */
export const mobileNavChrome = cva(
  'group text-core-nav-link flex items-center text-sm font-medium backdrop-blur transition',
  {
    variants: {
      chrome: {
        // Heights stated rather than left to the padding: this carries a text
        // label where its neighbours carry icons, so `py-2` alone put it 4px
        // taller than the segments in flat and 4px shorter than the pills in
        // outlined. Both match their own siblings now
        flat: 'bg-core-action-btn-track hover:bg-core-action-btn-background h-8 rounded-md px-3',
        outlined:
          'bg-core-navbar shadow-core-action-btn-shadow ring-core-action-btn-border hover:ring-core-action-btn-border-hover h-10 rounded-full px-4 shadow-lg ring-1'
      }
    },
    defaultVariants: { chrome: 'outlined' }
  }
);

/**
 * How many options a segmented control will show before it gives up.
 *
 * `site-settings.themes` is the built-ins plus a relationship to
 * `custom-themes`, so the count has no ceiling — three names fit a toolbar and
 * eight do not. Past this the flat expression falls back to a menu, but a
 * square one: folding into the round trigger would erase the variant exactly
 * when a tenant has the most to choose from.
 */
export const segmentLimit = 3;

/**
 * The track behind a segmented control.
 *
 * `--core-action-btn-track` earns its own token rather than reusing the
 * control's background at a lower alpha. In three of the five shipped themes
 * that background, the navbar and the page are all `var(--background)` — the
 * same colour — so a receded version of it composites back to the page and
 * leaves nothing on screen. The track sits one step off the page; the selected
 * segment is the control's background at full strength on top of it.
 */
export const segmentTrack = cva(
  'bg-core-action-btn-track flex w-fit items-center gap-0.5 rounded-md p-0.5 backdrop-blur transition'
);

/**
 * One segment.
 *
 * State is carried by the label as well as the fill — selected takes the hover
 * ink, unselected the muted one — so it never rests on a contrast step alone.
 */
export const segment = cva(
  'text-core-action-btn-foreground hover:text-core-action-btn-foreground-hover rounded-sm bg-transparent px-2 text-xs font-medium transition hover:bg-transparent data-[state=on]:bg-core-action-btn-background data-[state=on]:text-core-action-btn-foreground-hover data-[state=on]:shadow-sm'
);
