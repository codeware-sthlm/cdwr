'use client';

import { t } from '@codeware/shared/util/i18n';
import { cn } from '@codeware/shared/util/ui';
import { MonitorIcon, MoonStarIcon, SunIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { usePayload } from '../providers/PayloadProvider';

import { controlChrome } from './chrome';

/**
 * Render the icon with color transitions for the current color scheme.
 */
function getColorSchemeIcon(
  colorScheme: 'light' | 'dark' | 'system' | undefined
): React.ReactElement {
  let Icon;
  if (colorScheme === 'system') {
    Icon = MonitorIcon;
  } else if (colorScheme === 'dark') {
    Icon = MoonStarIcon;
  } else {
    Icon = SunIcon;
  }

  return (
    <Icon
      className={cn(
        'stroke-core-action-btn-foreground fill-core-action-btn-icon-fill group-hover:stroke-core-action-btn-foreground-hover size-6 stroke-[1.5] transition'
      )}
    />
  );
}

/**
 * Color scheme switch that cycles through light, dark, and system.
 * Uses PayloadProvider for color scheme state and updates.
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

  // Cycle through: light -> dark -> system -> light
  const getNextColorScheme = (
    current: 'light' | 'dark' | 'system' | undefined
  ): 'light' | 'dark' | 'system' => {
    if (current === 'light') return 'dark';
    if (current === 'dark') return 'system';
    return 'light';
  };

  const currentColorScheme = colorScheme ?? 'light';
  const nextColorScheme = getNextColorScheme(currentColorScheme);
  const icon = getColorSchemeIcon(currentColorScheme);

  const getColorSchemeLabel = (
    colorScheme: 'light' | 'dark' | 'system'
  ): string => {
    if (colorScheme === 'system') return t(locale, 'colorScheme.system');
    if (colorScheme === 'dark') return t(locale, 'colorScheme.dark');
    return t(locale, 'colorScheme.light');
  };

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
      {icon}
      <span className="sr-only capitalize">
        {getColorSchemeLabel(currentColorScheme)}
      </span>
    </button>
  );
}
