'use client';

import {
  ToggleGroup,
  ToggleGroupItem
} from '@codeware/shared/ui/shadcn/components/toggle-group';
import { t } from '@codeware/shared/util/i18n';
import { MonitorIcon, MoonStarIcon, SunIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { usePayload } from '../providers/PayloadProvider';

import { controlChrome, controlIcon, segment, segmentTrack } from './chrome';

type ColorScheme = 'light' | 'dark' | 'system';

/** The three schemes in the order the cycle already walked them. */
const colorSchemes: Array<ColorScheme> = ['light', 'dark', 'system'];

const icons = {
  light: SunIcon,
  dark: MoonStarIcon,
  system: MonitorIcon
};

/**
 * Color scheme switch, following the site's chrome.
 *
 * `outlined` cycles light → dark → system from one icon. `flat` shows all
 * three as segments, so every scheme is one click away rather than up to
 * three — a different control, which is the point of the variant.
 *
 * Renders nothing when the site locks its color scheme.
 */
export function ColorSchemeSwitch() {
  const { chrome, colorScheme, lockedColorScheme, setColorScheme, locale } =
    usePayload();
  const [mounted, setMounted] = useState(false);

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  // The site fixes the scheme, so there is nothing to switch between.
  // next-themes already holds it via `forcedTheme`; this only hides the control.
  if (lockedColorScheme !== null) {
    return null;
  }

  const getColorSchemeLabel = (colorScheme: ColorScheme): string => {
    if (colorScheme === 'system') return t(locale, 'colorScheme.system');
    if (colorScheme === 'dark') return t(locale, 'colorScheme.dark');
    return t(locale, 'colorScheme.light');
  };

  const currentColorScheme = colorScheme ?? 'light';

  if (chrome === 'flat') {
    return (
      <ToggleGroup
        type="single"
        value={currentColorScheme}
        // Radix clears the value when the active item is pressed again, and
        // there is no "no scheme" to fall back to
        onValueChange={(next) => next && setColorScheme(next as ColorScheme)}
        spacing={0}
        size="sm"
        aria-label={t(locale, 'colorScheme.switchTo', {
          colorScheme: getColorSchemeLabel(currentColorScheme)
        })}
        className={segmentTrack()}
      >
        {colorSchemes.map((value) => {
          const Icon = icons[value];
          const label = getColorSchemeLabel(value);

          return (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={label}
              title={label}
              className={segment()}
            >
              <Icon className="size-4 stroke-[1.5]" />
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    );
  }

  // Cycle through: light -> dark -> system -> light
  const getNextColorScheme = (current: ColorScheme): ColorScheme => {
    if (current === 'light') return 'dark';
    if (current === 'dark') return 'system';
    return 'light';
  };

  const nextColorScheme = getNextColorScheme(currentColorScheme);
  const Icon = icons[currentColorScheme];

  return (
    <button
      type="button"
      onClick={() => setColorScheme(nextColorScheme)}
      className={controlChrome({ chrome })}
      aria-label={t(locale, 'colorScheme.switchTo', {
        colorScheme: getColorSchemeLabel(nextColorScheme)
      })}
      title={t(locale, 'colorScheme.currentClickFor', {
        current: getColorSchemeLabel(currentColorScheme),
        next: getColorSchemeLabel(nextColorScheme)
      })}
    >
      <Icon className={controlIcon({ chrome })} />
      <span className="sr-only capitalize">
        {getColorSchemeLabel(currentColorScheme)}
      </span>
    </button>
  );
}
