module.exports = {
  displayName: 'builder',
  preset: '../../jest.preset.cjs',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test-setup.ts'],
  transform: {
    '^.+\\.m?[tj]s$': '@swc/jest'
  },
  // `@tailwindcss/node` builds on magic-string, which ships only ES modules
  // from 1.x; Jest runs CommonJS, so it is transformed like source rather
  // than skipped like the rest of node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(\\.pnpm/[^/]+/node_modules/)?magic-string/)'
  ],
  moduleFileExtensions: ['ts', 'js', 'mjs', 'html'],
  coverageDirectory: '../../coverage/apps/builder'
};
