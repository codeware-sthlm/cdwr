export default {
  displayName: 'cms',
  preset: '../../jest.preset.cjs',
  transform: {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nx/react/plugins/jest',
    '^.+\\.[tj]sx?$': ['babel-jest', { presets: ['@nx/next/babel'] }]
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  // `sanitize-html` parses with htmlparser2, which ships only ES modules, as
  // do the dom packages it builds on; Jest runs CommonJS, so these are
  // transformed like source rather than skipped like the rest of node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm/[^/]+/node_modules/)?(htmlparser2|domhandler|domutils|dom-serializer|domelementtype|entities)/)'
  ],
  coverageDirectory: '../../coverage/apps/cms',
  // A Next build copies the whole source tree — specs included — into
  // `.next/standalone`. Jest discovers those duplicates and runs them from
  // there, where relative paths the spec assumed (e.g. sibling `libs/`)
  // don't resolve, so they fail for a reason that has nothing to do with the
  // code under test.
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/']
};
