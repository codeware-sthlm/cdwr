import type { FaqTopic } from '@codeware/app-cms/util/definitions';
import type { ReactNode, SVGProps } from 'react';

/**
 * Small drawn scenes for the tour, one per step and one for the closing card.
 *
 * Each is a sketch of the admin area the step is about, not a screenshot, so
 * it never goes stale. The accent is `currentColor` (the step's hue, set by
 * the parent) and everything else comes from the theme's tokens, so the
 * scenes follow the theme in both colour schemes.
 */

/** A neutral card: the page's own surface with a hairline border */
const card = 'fill-background stroke-border';
/** A placeholder line of text */
const text = 'fill-muted-foreground/20';

const Scene = ({
  children,
  ...props
}: SVGProps<SVGSVGElement> & { children: ReactNode }) => (
  <svg
    viewBox="0 0 240 120"
    fill="none"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    {...props}
  >
    {children}
  </svg>
);

/** Blocks stacked into a page, one lifted to move, and the page on a phone */
const PagesScene = (props: SVGProps<SVGSVGElement>) => (
  <Scene {...props}>
    <rect x="20" y="12" width="120" height="26" rx="6" className={card} />
    <rect
      x="28"
      y="18"
      width="14"
      height="14"
      rx="3"
      fill="currentColor"
      fillOpacity={0.2}
    />
    <rect x="50" y="20" width="60" height="4" rx="2" className={text} />
    <rect x="50" y="28" width="40" height="4" rx="2" className={text} />

    <rect
      x="30"
      y="46"
      width="120"
      height="26"
      rx="6"
      className="fill-background"
      stroke="currentColor"
    />
    <circle cx="40" cy="55" r="1.5" fill="currentColor" />
    <circle cx="40" cy="63" r="1.5" fill="currentColor" />
    <circle cx="46" cy="55" r="1.5" fill="currentColor" />
    <circle cx="46" cy="63" r="1.5" fill="currentColor" />
    <rect x="56" y="54" width="70" height="4" rx="2" className={text} />
    <rect x="56" y="62" width="48" height="4" rx="2" className={text} />

    <rect x="20" y="80" width="120" height="26" rx="6" className={card} />
    <rect x="28" y="88" width="90" height="4" rx="2" className={text} />
    <rect x="28" y="96" width="64" height="4" rx="2" className={text} />

    <path d="M158 50l5-5 5 5M163 45v24M158 64l5 5 5-5" stroke="currentColor" />

    <rect x="182" y="8" width="44" height="104" rx="9" className={card} />
    <rect
      x="197"
      y="14"
      width="14"
      height="3"
      rx="1.5"
      className="fill-muted-foreground/30"
    />
    <rect
      x="188"
      y="24"
      width="32"
      height="16"
      rx="3"
      fill="currentColor"
      fillOpacity={0.25}
    />
    <rect x="188" y="46" width="32" height="12" rx="3" stroke="currentColor" />
    <rect x="188" y="64" width="32" height="3" rx="1.5" className={text} />
    <rect x="188" y="71" width="24" height="3" rx="1.5" className={text} />
    <rect x="188" y="80" width="32" height="22" rx="3" className="fill-muted" />
  </Scene>
);

/** A draft behind its earlier versions, and the Publish button that sends it out */
const DraftsScene = (props: SVGProps<SVGSVGElement>) => (
  <Scene {...props}>
    <rect
      x="34"
      y="6"
      width="86"
      height="96"
      rx="6"
      className="fill-muted stroke-border"
    />
    <rect
      x="27"
      y="10"
      width="86"
      height="96"
      rx="6"
      className="fill-muted stroke-border"
    />
    <rect
      x="20"
      y="14"
      width="86"
      height="96"
      rx="6"
      className="fill-background"
      stroke="currentColor"
      strokeDasharray="4 3"
    />
    <rect
      x="28"
      y="22"
      width="30"
      height="10"
      rx="5"
      fill="currentColor"
      fillOpacity={0.2}
    />
    <rect x="28" y="40" width="64" height="4" rx="2" className={text} />
    <rect x="28" y="48" width="56" height="4" rx="2" className={text} />
    <rect x="28" y="56" width="68" height="4" rx="2" className={text} />
    <rect x="28" y="68" width="48" height="4" rx="2" className={text} />
    <rect x="28" y="76" width="60" height="4" rx="2" className={text} />
    <path d="M88 96l10-10 4 4-10 10h-4z" stroke="currentColor" />

    <path d="M130 52h22M146 46l6 6-6 6" stroke="currentColor" />

    <rect x="162" y="14" width="64" height="58" rx="6" className={card} />
    <circle
      cx="194"
      cy="38"
      r="13"
      fill="currentColor"
      fillOpacity={0.15}
      stroke="currentColor"
    />
    <path
      d="M181 38h26M194 25c-5 6-5 20 0 26M194 25c5 6 5 20 0 26"
      stroke="currentColor"
    />
    <rect x="174" y="58" width="40" height="4" rx="2" className={text} />
    <rect x="162" y="82" width="64" height="22" rx="11" fill="currentColor" />
    <rect
      x="178"
      y="91"
      width="32"
      height="4"
      rx="2"
      className="fill-background"
    />
  </Scene>
);

/** A site's menu bar, and a new page on its way into it */
const NavigationScene = (props: SVGProps<SVGSVGElement>) => (
  <Scene {...props}>
    <rect x="14" y="10" width="212" height="100" rx="8" className={card} />
    <path d="M14 26h212" className="stroke-border" />
    <circle cx="24" cy="18" r="2.5" className="fill-muted-foreground/30" />
    <circle cx="32" cy="18" r="2.5" className="fill-muted-foreground/30" />
    <circle cx="40" cy="18" r="2.5" className="fill-muted-foreground/30" />

    <rect x="26" y="35" width="22" height="10" rx="3" fill="currentColor" />
    <rect x="112" y="36" width="26" height="8" rx="4" className={text} />
    <rect x="144" y="36" width="26" height="8" rx="4" className={text} />
    <rect
      x="176"
      y="35"
      width="38"
      height="10"
      rx="5"
      fill="currentColor"
      fillOpacity={0.25}
      stroke="currentColor"
    />

    <rect x="26" y="58" width="96" height="7" rx="3.5" className={text} />
    <rect x="26" y="72" width="120" height="4" rx="2" className={text} />
    <rect x="26" y="80" width="104" height="4" rx="2" className={text} />
    <rect x="26" y="88" width="112" height="4" rx="2" className={text} />

    <rect
      x="156"
      y="66"
      width="58"
      height="34"
      rx="6"
      className="fill-background"
      stroke="currentColor"
    />
    <rect x="164" y="76" width="34" height="4" rx="2" className={text} />
    <rect x="164" y="84" width="24" height="4" rx="2" className={text} />
    <path d="M195 62v-12M190 54l5-5 5 5" stroke="currentColor" />
  </Scene>
);

/** A site with its logo, look and footer, beside the settings that shape them */
const SiteSettingsScene = (props: SVGProps<SVGSVGElement>) => (
  <Scene {...props}>
    <rect x="14" y="10" width="140" height="100" rx="8" className={card} />
    <circle cx="30" cy="26" r="7" fill="currentColor" />
    <rect x="42" y="23" width="50" height="6" rx="3" className={text} />
    <rect
      x="24"
      y="42"
      width="120"
      height="30"
      rx="4"
      fill="currentColor"
      fillOpacity={0.15}
    />
    <rect x="34" y="52" width="60" height="5" rx="2.5" fill="currentColor" />
    <rect x="34" y="61" width="40" height="3" rx="1.5" className={text} />
    <rect x="24" y="80" width="120" height="22" rx="4" className="fill-muted" />
    <rect x="30" y="86" width="40" height="3" rx="1.5" className={text} />
    <rect x="30" y="93" width="60" height="3" rx="1.5" className={text} />

    <rect x="164" y="10" width="62" height="100" rx="8" className={card} />
    <circle cx="180" cy="28" r="7" fill="currentColor" />
    <circle cx="196" cy="28" r="7" fill="currentColor" fillOpacity={0.45} />
    <circle cx="212" cy="28" r="7" className="fill-muted-foreground/25" />
    <rect x="174" y="46" width="42" height="3" rx="1.5" className={text} />
    <rect x="174" y="60" width="28" height="14" rx="7" fill="currentColor" />
    <circle cx="195" cy="67" r="5" className="fill-background" />
    <rect
      x="174"
      y="84"
      width="28"
      height="14"
      rx="7"
      className="fill-muted-foreground/25"
    />
    <circle cx="181" cy="91" r="5" className="fill-background" />
  </Scene>
);

/** The search field with its shortcut, its results, and help close by */
const SearchHelpScene = (props: SVGProps<SVGSVGElement>) => (
  <Scene {...props}>
    <rect
      x="20"
      y="10"
      width="200"
      height="28"
      rx="8"
      className="fill-background"
      stroke="currentColor"
    />
    <circle cx="35" cy="23" r="5" stroke="currentColor" />
    <path d="M39 27l4 4" stroke="currentColor" />
    <rect x="50" y="22" width="70" height="4" rx="2" className={text} />
    <rect x="178" y="16" width="16" height="16" rx="3" className={card} />
    <path d="M183 21h6v6h-6z" className="stroke-muted-foreground/50" />
    <rect x="198" y="16" width="16" height="16" rx="3" className={card} />
    <rect
      x="203"
      y="23"
      width="6"
      height="2"
      rx="1"
      className="fill-muted-foreground/50"
    />

    <rect
      x="20"
      y="46"
      width="150"
      height="18"
      rx="5"
      fill="currentColor"
      fillOpacity={0.15}
    />
    <rect x="28" y="51" width="8" height="8" rx="2" fill="currentColor" />
    <rect x="42" y="53" width="80" height="4" rx="2" className={text} />
    <rect x="20" y="68" width="150" height="18" rx="5" className={card} />
    <rect
      x="28"
      y="73"
      width="8"
      height="8"
      rx="2"
      className="fill-muted-foreground/30"
    />
    <rect x="42" y="75" width="64" height="4" rx="2" className={text} />
    <rect x="20" y="90" width="150" height="18" rx="5" className={card} />
    <rect
      x="28"
      y="95"
      width="8"
      height="8"
      rx="2"
      className="fill-muted-foreground/30"
    />
    <rect x="42" y="97" width="72" height="4" rx="2" className={text} />

    <circle cx="200" cy="82" r="18" fill="currentColor" />
    <path
      d="M194 77a6 6 0 1 1 8.5 5.4c-1.6.8-2.5 1.8-2.5 3.6"
      className="stroke-background"
      strokeWidth={2.5}
    />
    <circle cx="200" cy="92" r="1.8" className="fill-background" />
  </Scene>
);

/** The account behind the sign-in, and the visitor statistics */
const MoreScene = (props: SVGProps<SVGSVGElement>) => (
  <Scene {...props}>
    <rect x="20" y="10" width="96" height="100" rx="8" className={card} />
    <circle cx="68" cy="38" r="16" fill="currentColor" fillOpacity={0.15} />
    <circle cx="68" cy="34" r="6" fill="currentColor" />
    <path d="M58 49a10 8 0 0 1 20 0z" fill="currentColor" />
    <rect x="42" y="64" width="52" height="5" rx="2.5" className={text} />
    <rect x="50" y="74" width="36" height="4" rx="2" className={text} />
    <rect x="46" y="88" width="44" height="12" rx="6" fill="currentColor" />
    <rect
      x="58"
      y="93"
      width="20"
      height="2"
      rx="1"
      className="fill-background"
    />

    <rect x="126" y="10" width="100" height="100" rx="8" className={card} />
    <rect x="136" y="20" width="40" height="4" rx="2" className={text} />
    <path d="M136 96h80" className="stroke-border" />
    <rect
      x="140"
      y="74"
      width="10"
      height="22"
      rx="2"
      fill="currentColor"
      fillOpacity={0.3}
    />
    <rect
      x="155"
      y="62"
      width="10"
      height="34"
      rx="2"
      fill="currentColor"
      fillOpacity={0.45}
    />
    <rect
      x="170"
      y="68"
      width="10"
      height="28"
      rx="2"
      fill="currentColor"
      fillOpacity={0.6}
    />
    <rect
      x="185"
      y="48"
      width="10"
      height="48"
      rx="2"
      fill="currentColor"
      fillOpacity={0.8}
    />
    <rect x="200" y="38" width="10" height="58" rx="2" fill="currentColor" />
  </Scene>
);

/** The scene for each step's topic; `more` is the closing card */
export const TOUR_ILLUSTRATIONS: Partial<
  Record<FaqTopic | 'more', (props: SVGProps<SVGSVGElement>) => ReactNode>
> = {
  pages: PagesScene,
  drafts: DraftsScene,
  navigation: NavigationScene,
  'site-settings': SiteSettingsScene,
  'search-help': SearchHelpScene,
  more: MoreScene
};
