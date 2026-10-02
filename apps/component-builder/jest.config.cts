module.exports = {
  displayName: 'component-builder',
  preset: '../../jest.preset.cjs',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': '@swc/jest'
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/component-builder'
};
