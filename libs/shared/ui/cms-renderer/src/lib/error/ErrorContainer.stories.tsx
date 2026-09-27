import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { ErrorContainer } from './ErrorContainer';

const meta = {
  title: 'cms-renderer/ErrorContainer',
  component: ErrorContainer,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof ErrorContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Error: Story = {
  globals: { colorScheme: 'light' },
  args: {
    severity: 'error',
    children: 'The page you requested could not be loaded. Please try again.'
  }
};

export const ErrorDark: Story = {
  name: 'Error (dark)',
  globals: { colorScheme: 'dark' },
  args: {
    severity: 'error',
    children: 'The page you requested could not be loaded. Please try again.'
  }
};

export const Info: Story = {
  globals: { colorScheme: 'light' },
  args: {
    severity: 'info',
    children: 'This page is currently unavailable. Check back later.'
  }
};

export const InfoDark: Story = {
  name: 'Info (dark)',
  globals: { colorScheme: 'dark' },
  args: {
    severity: 'info',
    children: 'This page is currently unavailable. Check back later.'
  }
};

export const WithCustomTitle: Story = {
  name: 'Custom title',
  globals: { colorScheme: 'light' },
  args: {
    severity: 'error',
    title: 'Content not found',
    children:
      'No content was found for this page. It may have been moved or deleted.'
  }
};

export const WithStackTrace: Story = {
  name: 'With stack trace',
  globals: { colorScheme: 'light' },
  args: {
    severity: 'error',
    children: 'An unexpected error occurred while rendering this page.',
    stackTrace: `TypeError: Cannot read properties of undefined (reading 'slug')
  at resolveCardBlockLink (resolve-card-block-link.ts:34:18)
  at CardBlock (CardBlock.tsx:60:32)
  at renderWithHooks (react-dom.development.js:14985:18)`
  }
};

export const WithStackTraceDark: Story = {
  name: 'With stack trace (dark)',
  globals: { colorScheme: 'dark' },
  args: {
    severity: 'error',
    children: 'An unexpected error occurred while rendering this page.',
    stackTrace: `TypeError: Cannot read properties of undefined (reading 'slug')
  at resolveCardBlockLink (resolve-card-block-link.ts:34:18)
  at CardBlock (CardBlock.tsx:60:32)
  at renderWithHooks (react-dom.development.js:14985:18)`
  }
};

export const WithoutContainer: Story = {
  name: 'Without container',
  globals: { colorScheme: 'light' },
  args: {
    severity: 'info',
    title: 'Inline alert',
    children:
      'Rendered without the full-page container and top margin. Use inside an existing layout section.',
    withoutContainer: true
  }
};

export const FrostLight = a11yStory(
  {
    args: {
      severity: 'error',
      children: 'The page you requested could not be loaded. Please try again.'
    }
  },
  'frost',
  'light'
);
export const FrostDark = a11yStory(
  {
    args: {
      severity: 'error',
      children: 'The page you requested could not be loaded. Please try again.'
    }
  },
  'frost',
  'dark'
);
export const PayloadAdminLight = a11yStory(
  {
    args: {
      severity: 'error',
      children: 'The page you requested could not be loaded. Please try again.'
    }
  },
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(
  {
    args: {
      severity: 'error',
      children: 'The page you requested could not be loaded. Please try again.'
    }
  },
  'payload-admin',
  'dark'
);
export const SpotlightLight = a11yStory(
  {
    args: {
      severity: 'error',
      children: 'The page you requested could not be loaded. Please try again.'
    }
  },
  'spotlight',
  'light'
);
export const SpotlightDark = a11yStory(
  {
    args: {
      severity: 'error',
      children: 'The page you requested could not be loaded. Please try again.'
    }
  },
  'spotlight',
  'dark'
);
export const CodewareLight = a11yStory(
  {
    args: {
      severity: 'error',
      children: 'The page you requested could not be loaded. Please try again.'
    }
  },
  'codeware',
  'light'
);
export const CodewareDark = a11yStory(
  {
    args: {
      severity: 'error',
      children: 'The page you requested could not be loaded. Please try again.'
    }
  },
  'codeware',
  'dark'
);
