import { contrastRatio, parseColor } from '@codeware/shared/util/color';
import {
  SiCloudflare,
  SiCloudflareHex,
  SiDocker,
  SiDockerHex,
  SiFlydotio,
  SiFlydotioHex,
  SiGithub,
  SiGithubHex,
  SiGithubactions,
  SiGithubactionsHex,
  SiGraphql,
  SiGraphqlHex,
  SiLinear,
  SiLinearHex,
  SiMongodb,
  SiMongodbHex,
  SiNetlify,
  SiNetlifyHex,
  SiNextdotjs,
  SiNextdotjsHex,
  SiNodedotjs,
  SiNodedotjsHex,
  SiNx,
  SiNxHex,
  SiPayloadcms,
  SiPayloadcmsHex,
  SiPnpm,
  SiPnpmHex,
  SiPostgresql,
  SiPostgresqlHex,
  SiReact,
  SiReactHex,
  SiRedis,
  SiRedisHex,
  SiRemix,
  SiRemixHex,
  SiSentry,
  SiSentryHex,
  SiStorybook,
  SiStorybookHex,
  SiStripe,
  SiStripeHex,
  SiSupabase,
  SiSupabaseHex,
  SiTailwindcss,
  SiTailwindcssHex,
  SiTypescript,
  SiTypescriptHex,
  SiVercel,
  SiVercelHex,
  SiVite,
  SiViteHex,
  SiVitest,
  SiVitestHex
} from '@icons-pack/react-simple-icons';

/** A technology whose mark ships with the platform */
export type TechBrand =
  | 'cloudflare'
  | 'docker'
  | 'flyio'
  | 'github'
  | 'github-actions'
  | 'graphql'
  | 'linear'
  | 'mongodb'
  | 'netlify'
  | 'nextjs'
  | 'nodejs'
  | 'nx'
  | 'payload'
  | 'pnpm'
  | 'postgresql'
  | 'react'
  | 'redis'
  | 'remix'
  | 'sentry'
  | 'storybook'
  | 'stripe'
  | 'supabase'
  | 'tailwind'
  | 'typescript'
  | 'vercel'
  | 'vite'
  | 'vitest';

type Tech = {
  name: string;
  Component: React.FC<React.ComponentPropsWithoutRef<'svg'>>;
  /** The brand's own colour, as the icon set ships it */
  hex: string;
  /** Too dark to read on a dark surface, where it takes the text colour */
  dark: boolean;
};

const black = parseColor('#000000');

// Under 3:1 against black, a mark disappears into a dark surface
const tech = (
  name: string,
  Component: Tech['Component'],
  hex: string
): Tech => {
  const color = parseColor(hex);
  const dark = !color || !black || contrastRatio(color, black) < 3;
  return { name, Component, hex, dark };
};

/**
 * The technology marks a block may show, each in its brand colour.
 *
 * Imported by name, so only these reach a bundle and not the whole icon set.
 * Every key is also a value in the database, so adding one needs a migration.
 */
export const techIconsMap: Record<TechBrand, Tech> = {
  cloudflare: tech('Cloudflare', SiCloudflare, SiCloudflareHex),
  docker: tech('Docker', SiDocker, SiDockerHex),
  flyio: tech('Fly.io', SiFlydotio, SiFlydotioHex),
  github: tech('GitHub', SiGithub, SiGithubHex),
  'github-actions': tech('GitHub Actions', SiGithubactions, SiGithubactionsHex),
  graphql: tech('GraphQL', SiGraphql, SiGraphqlHex),
  linear: tech('Linear', SiLinear, SiLinearHex),
  mongodb: tech('MongoDB', SiMongodb, SiMongodbHex),
  netlify: tech('Netlify', SiNetlify, SiNetlifyHex),
  nextjs: tech('Next.js', SiNextdotjs, SiNextdotjsHex),
  nodejs: tech('Node.js', SiNodedotjs, SiNodedotjsHex),
  nx: tech('Nx', SiNx, SiNxHex),
  payload: tech('Payload', SiPayloadcms, SiPayloadcmsHex),
  pnpm: tech('pnpm', SiPnpm, SiPnpmHex),
  postgresql: tech('PostgreSQL', SiPostgresql, SiPostgresqlHex),
  react: tech('React', SiReact, SiReactHex),
  redis: tech('Redis', SiRedis, SiRedisHex),
  remix: tech('Remix', SiRemix, SiRemixHex),
  sentry: tech('Sentry', SiSentry, SiSentryHex),
  storybook: tech('Storybook', SiStorybook, SiStorybookHex),
  stripe: tech('Stripe', SiStripe, SiStripeHex),
  supabase: tech('Supabase', SiSupabase, SiSupabaseHex),
  tailwind: tech('Tailwind CSS', SiTailwindcss, SiTailwindcssHex),
  typescript: tech('TypeScript', SiTypescript, SiTypescriptHex),
  vercel: tech('Vercel', SiVercel, SiVercelHex),
  vite: tech('Vite', SiVite, SiViteHex),
  vitest: tech('Vitest', SiVitest, SiVitestHex)
};
