import nx from '@nx/eslint-plugin';
// eslint-config-next v16 ships a native flat config (`Linter.Config[]`), so it
// is spread directly — no FlatCompat needed. `core-web-vitals` already includes
// the base `next` config.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

import baseConfig, {
  flyNodeApiOnly,
  noIsUserGuard
} from '../../eslint.config.mjs';

// The base config and the Next flat config both register the `import` plugin;
// strip it from the Next config to avoid a flat-config "plugin redefined" error.
// Returns new config objects rather than mutating the imported `eslint-config-next`
// singletons, which are shared across the process.
const removeDuplicateImportPlugin = (configArr) =>
  configArr.map((config) => {
    if (!config?.plugins?.import) {
      return config;
    }
    const plugins = { ...config.plugins };
    delete plugins.import;
    return { ...config, plugins };
  });

const config = [
  ...baseConfig,
  ...nx.configs['flat/react-typescript'],
  ...removeDuplicateImportPlugin(nextCoreWebVitals),
  ...flyNodeApiOnly,
  ...noIsUserGuard([
    'src/endpoints/**/*.ts',
    'src/app/api/**/*.ts',
    'src/collections/**/access/**/*.ts'
  ]),
  {
    ignores: [
      '.next/**/*',
      'next-env.d.ts',
      'src/app/(payload)/admin/importMap.js'
    ]
  },
  {
    files: ['src/app/(payload)/**/*'],
    rules: {
      '@nx/enforce-module-boundaries': 'off'
    }
  }
];

export default config;
