module.exports = {
  displayName: 'nx-payload',
  preset: '../../jest.preset.cjs',
  setupFilesAfterEnv: ['<rootDir>/test-setup.ts'],
  testEnvironment: 'node',
  globals: {},
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json'
      }
    ]
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/packages/nx-payload'
};
