/**
 * Storybook a11y helpers — for use in *.stories.tsx files only.
 *
 * Each call to `a11yStory` produces one story object with:
 *   - the chosen theme × color scheme combination set as globals
 *   - `parameters.a11y.test: 'error'` so axe violations fail the vitest run
 *
 * Use explicit `export const` declarations so the Storybook CSF parser can
 * statically discover each story (destructuring exports are not detected):
 *
 * ```ts
 * import { a11yStory } from '@codeware/shared/util/storybook';
 *
 * export const FrostLight    = a11yStory({ args }, 'frost', 'light');
 * export const FrostDark     = a11yStory({ args }, 'frost', 'dark');
 * export const SpotlightLight = a11yStory({ args }, 'spotlight', 'light');
 * export const SpotlightDark  = a11yStory({ args }, 'spotlight', 'dark');
 * export const CodewareLight  = a11yStory({ args }, 'codeware', 'light');
 * export const CodewareDark   = a11yStory({ args }, 'codeware', 'dark');
 * // ... all four themes, or only the ones relevant to the component
 * ```
 */

import type { SbTheme } from './storybook-themes';

export type { SbTheme } from './storybook-themes';
export type ColorScheme = 'light' | 'dark';

type BaseStory = {
  args?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  decorators?: unknown;
};

type AxeRuleConfig = { rules: Array<{ id: string; enabled: false }> };

type A11yStory<T extends BaseStory> = T & {
  name: string;
  globals: { theme: SbTheme; colorScheme: ColorScheme };
  parameters: {
    a11y: { test: 'error'; config?: AxeRuleConfig };
    docs: { disable: true };
  };
};

/**
 * Create a single a11y story for the given theme × color scheme combination.
 *
 * Always sets `parameters.a11y.test: 'error'` so axe violations fail.
 *
 * `disabledRules` turns off individual axe rules for this story. Reserve it for
 * violations owned by an upstream primitive (Radix, cmdk, sonner) that we cannot
 * fix from our side — never to silence a contrast issue in our own tokens.
 */
export function a11yStory<T extends BaseStory>(
  base: T,
  theme: SbTheme,
  colorScheme: ColorScheme,
  disabledRules?: Array<string>
): A11yStory<T> {
  return {
    ...base,
    name: `${theme} / ${colorScheme}`,
    globals: { theme, colorScheme },
    parameters: {
      ...base.parameters,
      a11y: {
        test: 'error',
        ...(disabledRules?.length && {
          config: {
            rules: disabledRules.map((id) => ({ id, enabled: false as const }))
          }
        })
      },
      docs: { disable: true }
    }
  };
}
