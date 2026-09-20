import { noIsUserGuard } from './rules/no-is-user-guard.js';

/**
 * Workspace-local ESLint rules.
 *
 * Plain ESM JavaScript on purpose: `eslint.config.mjs` is loaded by node
 * directly, so a TypeScript rule would need a loader in every context ESLint
 * runs in — the editor, the CLI and CI. JSDoc gives the rule objects their
 * types without that cost.
 *
 * Nx's `@nx/eslint:workspace-rules-project` generator is **not** the route
 * here: it wires rules through `@nx/eslint-plugin/workspace`, an entry point
 * that no longer exists in Nx 23 (its exports are `.`, `./angular`, `./nx`,
 * `./react` and `./typescript`). Flat config needs no plugin machinery anyway —
 * a plugin is just an object with a `rules` map.
 *
 * To add a rule: write it under `rules/`, export it here, and switch it on for
 * the paths it should guard in `eslint.config.mjs`. Scope belongs in the config
 * `files` glob, so a rule stays reusable.
 *
 * @type {import('eslint').ESLint.Plugin}
 */
export const codewareRules = {
  rules: {
    'no-is-user-guard': noIsUserGuard
  }
};
