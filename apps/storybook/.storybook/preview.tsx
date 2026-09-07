import { PayloadProvider } from '@codeware/shared/ui/cms-renderer';
import { cdwrCloudSvg } from '@codeware/shared/ui/primitives';
import type { SignupPolicy } from '@codeware/shared/util/payload-api';
import type { Decorator, Preview } from '@storybook/react-vite';
import { useEffect } from 'react';

import './preview.css';
import {
  STORYBOOK_THEMES,
  type SbTheme,
  THEME_DARK_STRATEGIES
} from './themes-meta';

const CLASS_DARK_THEMES = new Set(
  STORYBOOK_THEMES.filter((t) => THEME_DARK_STRATEGIES[t] === 'class')
);

const withPayload: Decorator = (Story, context) => {
  const colorScheme =
    (context.globals['colorScheme'] as 'light' | 'dark') ?? 'light';
  // Flat is defined by what it removes, so it wants checking on a pale theme
  // as much as a dark one — hence a toolbar switch rather than a fixed value
  const chrome =
    (context.globals['chrome'] as 'flat' | 'outlined') ?? 'outlined';
  const theme = (context.globals['theme'] as SbTheme) ?? STORYBOOK_THEMES[0];

  return (
    <PayloadProvider
      value={{
        appInfo: {
          name: 'storybook',
          version: '0.0.0',
          sha: '',
          deployEnv: 'development',
          buildTime: ''
        },
        getCurrentPath: () => window.location.pathname,
        iconConfig: { source: 'svg', svgCode: cdwrCloudSvg },
        navigate: (path, newTab) => {
          if (newTab) {
            window.open(path, '_blank', 'noreferrer');
          } else {
            window.location.href = path;
          }
        },
        payloadUrl: 'http://localhost:3000',
        submitForm: async () => ({
          success: false,
          data: { error: 'Not implemented in Storybook' }
        }),
        // Answers as the server would for a tour with room, so the success
        // path is reviewable; the queued path has its own story
        submitTourSignup: async () => ({
          success: true,
          data: { id: 1, status: 'booked' }
        }),
        // A story overrides this through `parameters.signupPolicy` to review
        // the terms checkbox or an unconfigured workspace
        signupPolicy:
          context.parameters['signupPolicy'] === undefined
            ? { privacyUrl: '/privacy', termsUrl: null, retentionDays: 365 }
            : (context.parameters['signupPolicy'] as SignupPolicy | null),
        setColorScheme: () => undefined,
        chrome,
        colorScheme,
        // Stories never lock the scheme — the Appearance toolbar drives it
        lockedColorScheme: null,
        resolvedColorScheme: colorScheme,
        // The Theme toolbar owns the theme here, via `data-sb-theme` on the
        // wrapper, so the provider only reports it
        theme,
        themes: STORYBOOK_THEMES.map((value) => ({ value, label: value })),
        setTheme: () => undefined,
        locale: 'en'
      }}
    >
      <Story />
    </PayloadProvider>
  );
};

const withTheme: Decorator = (Story, context) => {
  const colorScheme = (context.globals['colorScheme'] as string) ?? 'light';
  const theme = (context.globals['theme'] as SbTheme) ?? 'payload-admin';
  const usesClassDark = CLASS_DARK_THEMES.has(theme);

  // Mirror both axes onto document.body so portaled content (dialogs etc.)
  // inherits them. `data-theme` here carries Payload's own light/dark
  // convention, which is why the theme is scoped by `data-sb-theme` instead.
  // useEffect ensures cleanup on story unmount so state doesn't leak between stories.
  useEffect(() => {
    const prevTheme = document.body.getAttribute('data-sb-theme');
    const prevColorScheme = document.body.getAttribute('data-theme');
    const prevHadDark = document.body.classList.contains('dark');

    document.body.setAttribute('data-sb-theme', theme);
    if (usesClassDark) {
      document.body.removeAttribute('data-theme');
      document.body.classList.toggle('dark', colorScheme === 'dark');
    } else {
      document.body.setAttribute('data-theme', colorScheme);
      document.body.classList.remove('dark');
    }

    return () => {
      if (prevTheme) {
        document.body.setAttribute('data-sb-theme', prevTheme);
      } else {
        document.body.removeAttribute('data-sb-theme');
      }
      if (prevColorScheme) {
        document.body.setAttribute('data-theme', prevColorScheme);
      } else {
        document.body.removeAttribute('data-theme');
      }
      document.body.classList.toggle('dark', prevHadDark);
    };
  }, [colorScheme, theme, usesClassDark]);

  return (
    <div
      data-theme={usesClassDark ? undefined : colorScheme}
      data-sb-theme={theme}
      className={[
        'twp bg-background p-6',
        usesClassDark && colorScheme === 'dark' ? 'dark' : ''
      ].join(' ')}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Token set applied to the story',
      defaultValue: STORYBOOK_THEMES[0],
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [
          { value: 'shadcn', title: 'shadcn (reference)' },
          { value: 'payload-admin', title: 'Payload Admin' },
          { value: 'spotlight', title: 'Spotlight' },
          { value: 'codeware', title: 'Codeware' }
        ],
        dynamicTitle: true
      }
    },
    chrome: {
      description: 'How the header and its controls are drawn',
      defaultValue: 'outlined',
      toolbar: {
        title: 'Chrome',
        icon: 'component',
        items: [
          { value: 'outlined', title: 'Outlined' },
          { value: 'flat', title: 'Flat' }
        ],
        dynamicTitle: true
      }
    },
    colorScheme: {
      description: 'Light or dark appearance',
      defaultValue: 'light',
      toolbar: {
        title: 'Appearance',
        icon: 'circlehollow',
        items: [
          { value: 'light', icon: 'sun', title: 'Light' },
          { value: 'dark', icon: 'moon', title: 'Dark' }
        ],
        dynamicTitle: true
      }
    }
  },
  decorators: [withTheme, withPayload],
  parameters: {
    backgrounds: { disable: true },

    docs: {
      toc: true
    },

    options: {
      storySort: {
        order: [
          'Introduction',
          'Theme',
          'Shadcn',
          'Shared UI',
          'CMS Renderer',
          'cms-renderer',
          'app-cms',
          '*'
        ]
      }
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    }
  },
  tags: ['autodocs']
};

export default preview;
