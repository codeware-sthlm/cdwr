import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  { ignores: ['src-tauri/target/**', 'src-tauri/gen/**'] },
  {
    // The page script is moved verbatim from the artifact; keep it diffable
    files: ['src/desk.js'],
    rules: {
      'no-empty': 'off',
      '@typescript-eslint/no-unused-vars': 'off'
    }
  }
];
