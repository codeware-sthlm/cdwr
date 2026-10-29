import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  { ignores: ['src-tauri/target/**', 'src-tauri/gen/**'] }
];
