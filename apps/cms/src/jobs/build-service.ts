import type { BuildService } from './remote-component-build';

/** The builder's Fly app, as `apps/builder/fly.toml` names it */
const BUILDER_APP = 'cdwr-builder';

type ServiceEnv = {
  BUILDER_URL?: string;
  BUILDER_TOKEN?: string;
  DEPLOY_ENV: 'development' | 'preview' | 'production';
  PR_NUMBER?: string;
};

/**
 * Which build service this deployment talks to, or none for the local
 * toolchain.
 *
 * A configured url wins. A preview has no fixed url to configure, since its
 * builder is deployed per pull request and named after it, so the url is
 * derived from the number the deploy action hands over. Nothing is derived
 * for development or production: there the url is set or absent on purpose.
 */
export const resolveBuildService = (
  env: ServiceEnv | undefined
): BuildService | undefined => {
  if (!env) {
    return undefined;
  }
  const token = env.BUILDER_TOKEN;
  if (env.BUILDER_URL) {
    return { url: env.BUILDER_URL, token };
  }
  if (env.DEPLOY_ENV === 'preview' && env.PR_NUMBER) {
    return { url: `https://${BUILDER_APP}-pr-${env.PR_NUMBER}.fly.dev`, token };
  }
  return undefined;
};
