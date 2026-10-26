import nx from '@nx/eslint-plugin';

import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  ...nx.configs['flat/react-typescript'],
  {
    ignores: ['.output/**/*', 'src/routeTree.gen.ts']
  }
];
