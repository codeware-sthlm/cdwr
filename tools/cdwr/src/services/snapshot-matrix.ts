/** What `prefers-color-scheme` can be told, which is what the site follows */
export const COLOR_SCHEMES = ['light', 'dark'] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

/** The screens a page is drawn on; a new name fails to compile without a size */
export const VIEWPORT_NAMES = ['phone', 'desktop'] as const;
export type ViewportName = (typeof VIEWPORT_NAMES)[number];

export const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 900 }
} as const satisfies Record<ViewportName, { width: number; height: number }>;
