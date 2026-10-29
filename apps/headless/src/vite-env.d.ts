/// <reference types="vite/client" />

// Set at build time by `define` in vite.config.ts
interface ImportMetaEnv {
  readonly DEPLOY_ENV?: string;
  readonly SENTRY_DSN?: string;
  readonly SENTRY_RELEASE?: string;
}
