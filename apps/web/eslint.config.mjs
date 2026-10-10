import importPlugin from 'eslint-plugin-import';
import jsoncParser from 'jsonc-eslint-parser';

import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    plugins: { import: importPlugin }
  },
  {
    ignores: ['**/build', '**/server.js', '**/vitest.config.ts.timestamp*']
  },
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          // Shared libs are bundled from source, so their npm imports are
          // runtime deps of this app's image too. Whole-project granularity
          // over-reports; the ignores below are the packages web never reaches.
          includeTransitiveDependencies: true,
          ignoredDependencies: [
            // Loading secrets
            '@infisical/sdk',
            // Payload
            'react-dom',
            // Remix
            'isbot',
            // Payload components
            '@icons-pack/react-simple-icons',
            '@heroicons/react',
            '@payloadcms/richtext-lexical',
            'prism-react-renderer',
            'sanitize-html',
            // Payload components - Tailwind/Shadcn
            '@radix-ui/react-aspect-ratio',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-context-menu',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-menubar',
            '@radix-ui/react-popover',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
            '@radix-ui/react-tooltip',
            'class-variance-authority',
            'clsx',
            'lucide-react',
            'next-themes',
            'radix-ui',
            'react-hook-form',
            'sonner',
            'tailwind-merge',
            // Server-side/CMS-only libs in the transitive graph
            'payload',
            '@payloadcms/plugin-form-builder',
            // Dev dependencies
            '@storybook/react-vite',
            'dotenv',
            'is-ci',
            '@remix-run/testing',
            '@testing-library/jest-dom',
            '@testing-library/react',
            '@vitejs/plugin-react',
            'jsonc-eslint-parser',
            'vite',
            'vite-tsconfig-paths',
            'vitest'
          ],
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs}',
            '{projectRoot}/vite.config.{js,ts,mjs,mts}'
          ]
        }
      ]
    },
    languageOptions: {
      parser: jsoncParser
    }
  }
];
