import path from 'path';
import { fileURLToPath } from 'url';

import { composePlugins, withNx } from '@nx/next';
import { withPayload } from '@payloadcms/next/withPayload';
import { withSentryConfig } from '@sentry/nextjs/config';
import isCI from 'is-ci';

// Plain TypeScript with no imports, so Node loads it with its types stripped
import { cspBaseline } from '../../libs/shared/util/csp/src/lib/csp.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Log build-time environment for debugging
if (process.env.NX_TASK_TARGET_TARGET === 'build') {
  console.log(`
    [BUILD] Environment variables available to Sentry in next.config.mjs:
    [BUILD] - DEPLOY_ENV: ${process.env.DEPLOY_ENV || '✗ not set'}
    [BUILD] - FLY_URL: ${process.env.FLY_URL || '✗ not set'}
    [BUILD] - NEXT_PUBLIC_DEPLOY_ENV: ${process.env.NEXT_PUBLIC_DEPLOY_ENV || '✗ not set'}
    [BUILD] - NEXT_PUBLIC_SENTRY_DSN: ${process.env.NEXT_PUBLIC_SENTRY_DSN ? '✓ set' : '✗ not set'}
    [BUILD] - NEXT_PUBLIC_SENTRY_RELEASE: ${process.env.NEXT_PUBLIC_SENTRY_RELEASE || '✗ not set'}
    [BUILD] - SENTRY_AUTH_TOKEN: ${process.env.SENTRY_AUTH_TOKEN ? '✓ set' : '✗ not set'}
    [BUILD] - SENTRY_ORG: ${process.env.SENTRY_ORG ? '✓ set' : '✗ not set'}
    [BUILD] - SENTRY_PROJECT: ${process.env.SENTRY_PROJECT ? '✓ set' : '✗ not set'}
    [BUILD] - SENTRY_RELEASE: ${process.env.SENTRY_RELEASE || '✗ not set'}
    `);
}

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  nx: {
    // Set this to true if you would like to use SVGR
    // See: https://github.com/gregberge/svgr
    svgr: false
  },
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),

  // Enable source maps for Sentry error tracking
  // These are uploaded to Sentry and deleted from the build output
  productionBrowserSourceMaps: true,

  sassOptions: {
    quietDeps: true,
    silenceDeprecations: ['import', 'legacy-js-api'],

    // ✅ Hard filter: suppress the @import deprecation spam from deps
    logger: {
      warn(message, options) {
        // message is a string (sometimes includes “Deprecation Warning”)
        if (
          typeof message === 'string' &&
          (message.includes('Sass @import rules are deprecated') ||
            message.includes('will be removed in Dart Sass 2.0.0'))
        ) {
          return;
        }

        // Keep other warnings (optional)
        console.warn(message);
      },
      debug() {
        // ignore
      }
    }
  },

  reactCompiler: false,

  // The component builder: native and large, and only ever run on the server.
  // `typescript` is externalized by Next already
  serverExternalPackages: [
    'esbuild',
    '@tailwindcss/node',
    '@tailwindcss/oxide'
  ],

  // The enforced CSP baseline. Not sent from the proxy: Next copies every
  // header the proxy sets onto the request too, where this nonce-less policy
  // would hide the proxy's nonce from Next. With CSP_ENFORCE on, the proxy's
  // full policy replaces it (same header, and the proxy runs after these)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'content-security-policy', value: cspBaseline() }]
      }
    ];
  },

  experimental: {
    // The proxy runs on every route, api included, so Next buffers each body
    // and cuts it off at this size. It has to clear Payload's 25 MB upload
    // limit, or a larger upload arrives broken and fails with a 500 instead of
    // being refused with a 413
    proxyClientMaxBodySize: '30mb',
    // Enable server-side source maps for better error tracking
    serverSourceMaps: true
  }
};

/**
 * Sentry build options - can also automatically read from environment:
 * - SENTRY_AUTH_TOKEN (required for source map upload)
 * - SENTRY_ORG (required for source map upload)
 * - SENTRY_PROJECT (required for source map upload)
 * - SENTRY_RELEASE (release name - created in CI/CD workflow before build)
 *
 * The Sentry webpack plugin automatically uploads source maps during build
 * to the release created in the GitHub workflow.
 *
 * IMPORTANT for Docker builds:
 * These environment variables must be converted from ARG to ENV in the Dockerfile
 * before the build command so the webpack plugin can access them.
 *
 * @type import('@sentry/nextjs').SentryBuildOptions
 */
const sentryConfig = {
  organization: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only print logs in CI builds
  silent: !isCI,
  debug: false,

  // Disable telemetry data collection
  telemetry: false,

  // Route Sentry requests through your server (avoids ad-blockers),
  // This increases server load. Consider the trade-off for the application.
  tunnelRoute: '/monitoring',

  // Do not upload source maps for node_modules to reduce build size
  widenClientFileUpload: false,

  // CRITICAL for Next.js 15+: Use post-build hook for source map upload
  // This works with both webpack and Turbopack
  useRunAfterProductionCompileHook: true,

  // Release management: The release is created in the GitHub workflow before build,
  // so we only need to upload source maps to the existing release
  release: {
    name: process.env.SENTRY_RELEASE,
    create: false, // Don't create - already created in GitHub workflow
    finalize: false // Don't finalize - done in GitHub workflow after deployment
  }
};

const plugins = [
  // Add more Next.js plugins to this list if needed.
  withNx,
  withPayload,
  (config) => withSentryConfig(config, sentryConfig)
];

export default composePlugins(...plugins)(nextConfig);
