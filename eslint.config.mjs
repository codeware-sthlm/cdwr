import nx from '@nx/eslint-plugin';
import importPlugin from 'eslint-plugin-import';

import { codewareRules } from './tools/eslint-rules/index.js';

/**
 * Restricts fly-node to its api half.
 *
 * The cms image has no flyctl binary and no native pty, so importing the root
 * barrel breaks its build with a resolution error that says nothing about why.
 * Spread into the config of every project that reaches for fly-node from an
 * application runtime — module boundaries work per project and cannot name a
 * subpath, and a project-level config only sees project-relative globs.
 */
export const flyNodeApiOnly = [
  {
    files: ['**/*.ts?(x)'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@cdwr/fly-node',
              message:
                "Use '@cdwr/fly-node/api'. The root barrel pulls in the flyctl wrapper and its native pty dependency, which this runtime does not have."
            }
          ]
        }
      ]
    }
  }
];

/**
 * Forbids `isUser` as an authorization guard on the paths given.
 *
 * Spread into the config of every project with a surface where identity decides
 * what may be done — `isUser` is true for a reader, so guarding with it grants
 * a reader editor access, and it fails open.
 *
 * Takes its globs because a project-level config only sees **project-relative**
 * paths, the same constraint `flyNodeApiOnly` documents above.
 *
 * @param {Array<string>} files - Project-relative globs to guard.
 */
export const noIsUserGuard = (files) => [
  {
    files,
    ignores: ['**/*.spec.ts'],
    plugins: { codeware: codewareRules },
    rules: {
      'codeware/no-is-user-guard': 'error'
    }
  }
];

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    plugins: { import: importPlugin }
  },
  {
    ignores: [
      '**/dist',
      '**/vite.config.[cm]?ts.timestamp-*.[cm]js',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*'
    ]
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: false,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?js$'],
          depConstraints: [
            { sourceTag: 'scope:tools', onlyDependOnLibsWithTags: ['*'] },
            {
              sourceTag: 'type:util',
              onlyDependOnLibsWithTags: ['type:util']
            },
            {
              // type:theme is a dependency-free leaf — token CSS plus the
              // generated theme registry — so it sits alongside type:util here
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: ['type:ui', 'type:util', 'type:theme']
            },
            {
              sourceTag: 'scope:packages',
              onlyDependOnLibsWithTags: ['scope:packages']
            },
            {
              sourceTag: 'scope:cms',
              onlyDependOnLibsWithTags: [
                'scope:app-cms',
                'scope:cms',
                'scope:fly-node',
                'scope:shared',
                'domain:signature'
              ]
            },
            {
              sourceTag: 'scope:cms-e2e',
              onlyDependOnLibsWithTags: [
                'scope:cms-e2e',
                'scope:app-cms',
                'scope:shared'
              ]
            },
            {
              sourceTag: 'scope:app-cms',
              onlyDependOnLibsWithTags: [
                'scope:app-cms',
                'scope:fly-node',
                'scope:shared',
                'type:ui',
                'type:util'
              ]
            },
            {
              sourceTag: 'scope:web',
              onlyDependOnLibsWithTags: [
                'scope:web',
                'scope:shared',
                'domain:signature'
              ]
            },
            {
              sourceTag: 'scope:create-nx-payload',
              onlyDependOnLibsWithTags: [
                'scope:create-nx-payload',
                'scope:shared'
              ]
            },
            {
              sourceTag: 'scope:e2e-utils',
              onlyDependOnLibsWithTags: ['scope:e2e-utils', 'scope:shared']
            },
            {
              sourceTag: 'scope:fly-build-action',
              onlyDependOnLibsWithTags: [
                'scope:fly-build-action',
                'scope:fly-node',
                'scope:shared'
              ]
            },
            {
              sourceTag: 'scope:fly-deployment-action',
              onlyDependOnLibsWithTags: [
                'scope:fly-deployment-action',
                'scope:fly-node',
                'scope:shared'
              ]
            },
            {
              sourceTag: 'scope:fly-destroy-action',
              onlyDependOnLibsWithTags: [
                'scope:fly-destroy-action',
                'scope:fly-node',
                'scope:shared'
              ]
            },
            {
              sourceTag: 'scope:fly-node',
              onlyDependOnLibsWithTags: ['scope:fly-node', 'scope:shared']
            },
            {
              sourceTag: 'scope:nx-migrate-action',
              onlyDependOnLibsWithTags: [
                'scope:nx-migrate-action',
                'scope:shared'
              ]
            },
            {
              sourceTag: 'scope:nx-payload',
              onlyDependOnLibsWithTags: ['scope:nx-payload', 'scope:shared']
            },
            {
              sourceTag: 'scope:nx-payload-e2e',
              onlyDependOnLibsWithTags: [
                'scope:nx-payload-e2e',
                'scope:e2e-utils',
                'scope:shared'
              ]
            },
            {
              sourceTag: 'scope:nx-pre-deploy-action',
              onlyDependOnLibsWithTags: [
                'scope:nx-pre-deploy-action',
                'scope:shared'
              ]
            },
            {
              sourceTag: 'scope:pr-comment-action',
              onlyDependOnLibsWithTags: [
                'scope:pr-comment-action',
                'scope:shared'
              ]
            },
            {
              sourceTag: 'scope:nx-changelog-action',
              onlyDependOnLibsWithTags: [
                'scope:nx-changelog-action',
                'scope:shared'
              ]
            },
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared']
            },
            {
              sourceTag: 'scope:storybook',
              onlyDependOnLibsWithTags: ['scope:storybook', 'scope:shared']
            }
          ]
        }
      ]
    }
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.cts',
      '**/*.mjs',
      '**/*.mts'
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    rules: {
      'sort-imports': [
        'error',
        {
          ignoreCase: false,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
          allowSeparatedGroups: true
        }
      ],
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['sibling', 'parent'],
            'index',
            'unknown'
          ],
          pathGroups: [
            {
              pattern: './**',
              group: 'index',
              position: 'after'
            }
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true
          }
        }
      ]
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {}
  }
];
