import type { DEPLOYED } from '../../services/environment';

/** The Infisical projects `secrets list` reads, each with the environments it holds */
export const PROJECTS = {
  codeware: {
    id: 'abb137af-e48b-4dc9-96eb-451a3ce36494',
    environments: ['production', 'preview']
  },
  'agent-host': {
    id: '5b001cc1-0b7e-4149-b40d-d2a454c8da35',
    environments: ['production']
  }
} as const satisfies Record<
  string,
  { id: string; environments: readonly SecretEnvironment[] }
>;

export type SecretEnvironment = (typeof DEPLOYED)[number];
export type ProjectName = keyof typeof PROJECTS;

/** The project names in reading order; a spec keeps them equal to `PROJECTS` */
export const PROJECT_NAMES = [
  'codeware',
  'agent-host'
] as const satisfies readonly ProjectName[];

/** What a value is; every kind but `setting` is a credential */
export type SecretKind =
  | 'setting'
  | 'token'
  | 'api-key'
  | 'password'
  | 'signing-key'
  | 'database-url'
  | 'identity'
  | 'webhook'
  | 'dsn';

export type CredentialKind = Exclude<SecretKind, 'setting'>;

/** A cdwr command path, checked against the registry in a spec, or the steps by hand */
export type Rotation =
  { command: readonly [string, ...string[]] } | { manual: string };

/** Where the expiry is read from; never stored here */
export type ExpirySource =
  | { source: 'fly'; tokenName: string }
  | { source: 'none' }
  | { source: 'unknown' };

interface Base {
  project: ProjectName;
  /** Folder path; a `<tenant>` segment matches any tenant folder */
  path: string;
  key: string;
  /** Limits the entry to these environments; all of the project's when left out */
  environments?: readonly SecretEnvironment[];
  purpose: string;
}

export type CatalogEntry =
  | (Base & { kind: 'setting' })
  | (Base & {
      kind: CredentialKind;
      rotation: Rotation;
      expiry: ExpirySource;
    });

export const CATALOG: readonly CatalogEntry[] = [
  {
    project: 'codeware',
    path: '/',
    key: 'DEBUG',
    kind: 'setting',
    purpose: 'Turns on debug logging for the process'
  },
  {
    project: 'codeware',
    path: '/apps/builder',
    key: 'BUILDER_TOKEN',
    kind: 'token',
    purpose:
      'Shared token the cms and the builder service use to authenticate builds',
    rotation: { command: ['builder', 'rotate-token'] },
    expiry: { source: 'none' }
  },
  {
    project: 'codeware',
    path: '/apps/builder',
    key: 'DEPLOY_ENABLED',
    kind: 'setting',
    purpose: 'Switches deploys of the builder service on when set to true'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'BUILDER_TOKEN',
    kind: 'token',
    purpose:
      'Shared token the cms and the builder service use to authenticate builds',
    rotation: { command: ['builder', 'rotate-token'] },
    expiry: { source: 'none' }
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'BUILDER_URL',
    kind: 'setting',
    purpose: 'Address of the builder service the cms sends component builds to'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'CORS_URLS',
    kind: 'setting',
    purpose: 'Origins the cms API allows for CORS, comma separated or *'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'CSRF_URLS',
    kind: 'setting',
    purpose: 'Origins the cms accepts for CSRF checks, comma separated'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'DATABASE_SCHEMA',
    kind: 'setting',
    purpose: 'Postgres schema the cms tables live in (payload)'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'DATABASE_URL',
    environments: ['production'],
    kind: 'database-url',
    purpose: 'Pooled Postgres connection string the cms runs on',
    rotation: {
      manual:
        'Reset the database role password in Supabase, write the new URL to Infisical, redeploy the cms'
    },
    expiry: { source: 'none' }
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'DEPLOY_ENABLED',
    kind: 'setting',
    purpose: 'Switches deploys of this app on when set to true'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'DIRECT_DATABASE_URL',
    environments: ['production'],
    kind: 'database-url',
    purpose: 'Direct (session) Postgres connection string used by migrations',
    rotation: {
      manual:
        'Reset the database role password in Supabase, write the new URL to Infisical, redeploy the cms'
    },
    expiry: { source: 'none' }
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'FONT_ASSETS_BASE_URL',
    kind: 'setting',
    purpose: 'Base URL of the public bucket holding theme font files'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'LOG_LEVEL',
    kind: 'setting',
    purpose: 'Log level of the cms'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'PAYLOAD_SECRET_KEY',
    kind: 'signing-key',
    purpose:
      'Payload secret that signs sessions and tokens; rotating logs everyone out',
    rotation: {
      manual:
        'Generate a new random value, write it to Infisical, redeploy the cms (all sessions end)'
    },
    expiry: { source: 'none' }
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'PORT',
    kind: 'setting',
    purpose: 'Port the server listens on'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'S3_ACCESS_KEY_ID',
    kind: 'api-key',
    purpose:
      'Access key id for the S3 media bucket (paired with the secret access key)',
    rotation: {
      manual:
        'Create a new access key pair in the storage provider, write both S3 keys to Infisical, redeploy, delete the old pair'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'S3_BUCKET',
    kind: 'setting',
    purpose: 'Name of the S3 media bucket'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'S3_ENDPOINT',
    kind: 'setting',
    purpose: 'S3 endpoint URL of the storage provider'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'S3_FORCE_PATH_STYLE',
    kind: 'setting',
    purpose: 'Use path-style S3 addressing instead of virtual-hosted style'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'S3_REGION',
    kind: 'setting',
    purpose: 'S3 region of the media bucket'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'S3_SECRET_ACCESS_KEY',
    kind: 'api-key',
    purpose: 'Secret access key for the S3 media bucket',
    rotation: {
      manual:
        'Create a new access key pair in the storage provider, write both S3 keys to Infisical, redeploy, delete the old pair'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'SEED_DATA_URL',
    kind: 'setting',
    purpose: 'Remote location the seed data is fetched from'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'SEED_SOURCE',
    kind: 'setting',
    purpose: 'Where seed data comes from (local, remote or off)'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'SEED_STRATEGY',
    kind: 'setting',
    purpose: 'How seeding applies data to an existing database (delta or other)'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'SENDGRID_API_KEY',
    environments: ['production'],
    kind: 'api-key',
    purpose: 'SendGrid key the cms sends production email with',
    rotation: {
      manual:
        'Create a new SendGrid API key, write it to Infisical, redeploy the cms, delete the old key'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'SENDGRID_FROM_ADDRESS',
    environments: ['production'],
    kind: 'setting',
    purpose: 'From address of outgoing email'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'SENDGRID_FROM_NAME',
    environments: ['production'],
    kind: 'setting',
    purpose: 'From name of outgoing email'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'SENTRY_DSN',
    kind: 'dsn',
    purpose: 'Sentry DSN the app reports errors to',
    rotation: {
      manual:
        'Create a new DSN key in the Sentry project, write it to Infisical, redeploy, disable the old key'
    },
    expiry: { source: 'none' }
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'SENTRY_PROJECT',
    kind: 'setting',
    purpose: 'Sentry project slug the app reports to'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'TURNSTILE_SECRET_KEY',
    environments: ['production'],
    kind: 'api-key',
    purpose: 'Cloudflare Turnstile secret that verifies form submissions',
    rotation: {
      manual:
        'Rotate the secret in the Cloudflare Turnstile widget, write it to Infisical, redeploy'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'TURNSTILE_SITE_KEY',
    environments: ['production'],
    kind: 'setting',
    purpose: 'Public Cloudflare Turnstile site key shown in forms'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'UMAMI_URL',
    environments: ['production'],
    kind: 'setting',
    purpose: 'Address of the Umami statistics service'
  },
  {
    project: 'codeware',
    path: '/apps/cms/api-url',
    key: 'PAYLOAD_URL',
    kind: 'setting',
    purpose: 'Address of the host cms, set per deploy for preview'
  },
  {
    project: 'codeware',
    path: '/apps/cms/signature',
    key: 'SIGNATURE_SECRET',
    kind: 'signing-key',
    purpose:
      'Secret that signs requests between the headless clients and the cms',
    rotation: { command: ['signature', 'rotate'] },
    expiry: { source: 'none' }
  },
  {
    project: 'codeware',
    path: '/apps/headless',
    key: 'CSP_ENFORCE',
    kind: 'setting',
    purpose: 'Enforce the Content-Security-Policy instead of reporting only'
  },
  {
    project: 'codeware',
    path: '/apps/headless',
    key: 'FONT_ASSETS_BASE_URL',
    kind: 'setting',
    purpose: 'Base URL of the public bucket holding theme font files'
  },
  {
    project: 'codeware',
    path: '/apps/headless',
    key: 'SENTRY_DSN',
    kind: 'dsn',
    purpose: 'Sentry DSN the app reports errors to',
    rotation: {
      manual:
        'Create a new DSN key in the Sentry project, write it to Infisical, redeploy, disable the old key'
    },
    expiry: { source: 'none' }
  },
  {
    project: 'codeware',
    path: '/apps/headless',
    key: 'SENTRY_PROJECT',
    kind: 'setting',
    purpose: 'Sentry project slug the app reports to'
  },
  {
    project: 'codeware',
    path: '/apps/headless',
    key: 'UMAMI_URL',
    environments: ['production'],
    kind: 'setting',
    purpose: 'Address of the Umami statistics service'
  },
  {
    project: 'codeware',
    path: '/apps/storybook',
    key: 'CHROMATIC_PROJECT_TOKEN',
    kind: 'token',
    purpose: 'Chromatic project token for publishing Storybook',
    rotation: {
      manual:
        'Regenerate the token in the Chromatic project settings, write it to Infisical, update the GitHub secret'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'codeware',
    path: '/apps/umami',
    key: 'DEPLOY_ENABLED',
    environments: ['production'],
    kind: 'setting',
    purpose: 'Switches deploys of Umami on when set to true'
  },
  {
    project: 'codeware',
    path: '/apps/web',
    key: 'DEBUG',
    kind: 'setting',
    purpose: 'Turns on debug logging for the process'
  },
  {
    project: 'codeware',
    path: '/apps/web',
    key: 'PORT',
    kind: 'setting',
    purpose: 'Port the server listens on'
  },
  {
    project: 'codeware',
    path: '/apps/web',
    key: 'SENTRY_DSN',
    kind: 'dsn',
    purpose: 'Sentry DSN the app reports errors to',
    rotation: {
      manual:
        'Create a new DSN key in the Sentry project, write it to Infisical, redeploy, disable the old key'
    },
    expiry: { source: 'none' }
  },
  {
    project: 'codeware',
    path: '/apps/web',
    key: 'SENTRY_PROJECT',
    kind: 'setting',
    purpose: 'Sentry project slug the app reports to'
  },
  {
    project: 'codeware',
    path: '/integrations/fly',
    key: 'API_TOKEN',
    kind: 'token',
    purpose: 'Fly API token the platform tooling uses against Fly',
    rotation: {
      manual:
        'fly tokens create org, write it to Infisical, revoke the old token'
    },
    expiry: { source: 'fly', tokenName: 'Org cms token' }
  },
  {
    project: 'codeware',
    path: '/integrations/umami',
    key: 'API_KEY',
    environments: ['production'],
    kind: 'api-key',
    purpose: 'Umami API key the cms reads site statistics with',
    rotation: {
      manual:
        'Create a new API key in Umami, write it to Infisical, delete the old key'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'codeware',
    path: '/integrations/umami',
    key: 'PROVISION_API_KEY',
    environments: ['production'],
    kind: 'api-key',
    purpose: 'Admin Umami API key used to provision websites and teams',
    rotation: {
      manual:
        'Create a new API key for the admin user in Umami, write it to Infisical, delete the old key'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'codeware',
    path: '/integrations/umami',
    key: 'UMAMI_ADMIN_PASSWORD',
    environments: ['production'],
    kind: 'password',
    purpose: 'Umami admin password for calls that refuse API keys',
    rotation: { manual: 'Change the password in Umami, write it to Infisical' },
    expiry: { source: 'none' }
  },
  {
    project: 'codeware',
    path: '/integrations/umami',
    key: 'UMAMI_ADMIN_USERNAME',
    environments: ['production'],
    kind: 'setting',
    purpose: 'Umami admin username'
  },
  {
    project: 'codeware',
    path: '/sentry',
    key: 'SENTRY_AUTH_TOKEN',
    kind: 'token',
    purpose: 'Sentry token that uploads source maps in builds',
    rotation: {
      manual:
        'Create a new Sentry auth token, write it to Infisical, revoke the old one'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'codeware',
    path: '/sentry',
    key: 'SENTRY_DSN',
    kind: 'dsn',
    purpose: 'Default Sentry DSN',
    rotation: {
      manual:
        'Create a new DSN key in the Sentry project, write it to Infisical, redeploy, disable the old key'
    },
    expiry: { source: 'none' }
  },
  {
    project: 'codeware',
    path: '/sentry',
    key: 'SENTRY_ORG',
    kind: 'setting',
    purpose: 'Sentry organization slug'
  },
  {
    project: 'codeware',
    path: '/sentry',
    key: 'SENTRY_PROJECT',
    kind: 'setting',
    purpose: 'Default Sentry project slug'
  },
  {
    project: 'codeware',
    path: '/tenants/<tenant>',
    key: 'TURNSTILE_SECRET_KEY',
    environments: ['production'],
    kind: 'api-key',
    purpose: 'Cloudflare Turnstile secret that verifies form submissions',
    rotation: {
      manual:
        'Rotate the secret in the Cloudflare Turnstile widget, write it to Infisical, redeploy'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'codeware',
    path: '/tenants/<tenant>',
    key: 'TURNSTILE_SITE_KEY',
    environments: ['production'],
    kind: 'setting',
    purpose: 'Public Cloudflare Turnstile site key shown in forms'
  },
  {
    project: 'codeware',
    path: '/tenants/<tenant>/apps/cms',
    key: 'DEPLOY_ENABLED',
    kind: 'setting',
    purpose: 'Switches deploys of this app on when set to true'
  },
  {
    project: 'codeware',
    path: '/tenants/<tenant>/apps/cms',
    key: 'PAYLOAD_API_KEY',
    kind: 'api-key',
    purpose: 'API key the tenant app authenticates to the cms with',
    rotation: { command: ['tenant', 'rotate-key'] },
    expiry: { source: 'none' }
  },
  {
    project: 'codeware',
    path: '/tenants/<tenant>/apps/cms',
    key: 'RESTRICTED_FONTS',
    kind: 'setting',
    purpose: 'Restricted theme fonts this tenant is granted'
  },
  {
    project: 'codeware',
    path: '/tenants/<tenant>/apps/cms',
    key: 'SITE_GATE_PASSWORD',
    kind: 'password',
    purpose: 'Password of the tenant site gate',
    rotation: {
      manual: 'Pick a new value, write it to Infisical, redeploy the tenant app'
    },
    expiry: { source: 'none' }
  },
  {
    project: 'codeware',
    path: '/tenants/<tenant>/apps/headless',
    key: 'DEPLOY_ENABLED',
    kind: 'setting',
    purpose: 'Switches deploys of this app on when set to true'
  },
  {
    project: 'codeware',
    path: '/tenants/<tenant>/apps/headless',
    key: 'PAYLOAD_API_KEY',
    kind: 'api-key',
    purpose: 'API key the tenant app authenticates to the cms with',
    rotation: { command: ['tenant', 'rotate-key'] },
    expiry: { source: 'none' }
  },
  {
    project: 'codeware',
    path: '/tenants/<tenant>/apps/headless',
    key: 'RESTRICTED_FONTS',
    kind: 'setting',
    purpose: 'Restricted theme fonts this tenant is granted'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'SEED_PASSWORD',
    environments: ['preview'],
    kind: 'password',
    purpose: 'Password given to the seeded users in preview',
    rotation: {
      manual:
        'Pick a new value, write it to Infisical; it applies to the next preview seed'
    },
    expiry: { source: 'none' }
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'SMTP_FROM_ADDRESS',
    environments: ['preview'],
    kind: 'setting',
    purpose: 'From address of outgoing preview email'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'SMTP_FROM_NAME',
    environments: ['preview'],
    kind: 'setting',
    purpose: 'From name of outgoing preview email'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'SMTP_HOST',
    environments: ['preview'],
    kind: 'setting',
    purpose: 'SMTP host for preview email'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'SMTP_PASSWORD',
    environments: ['preview'],
    kind: 'password',
    purpose: 'SMTP password for preview email',
    rotation: {
      manual:
        'Reset the password at the SMTP provider and write it to Infisical'
    },
    expiry: { source: 'none' }
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'SMTP_PORT',
    environments: ['preview'],
    kind: 'setting',
    purpose: 'SMTP port for preview email'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'SMTP_USERNAME',
    environments: ['preview'],
    kind: 'setting',
    purpose: 'SMTP username for preview email'
  },
  {
    project: 'codeware',
    path: '/apps/cms',
    key: 'TOTP_EXEMPT_SEEDED_USERS',
    environments: ['preview'],
    kind: 'setting',
    purpose: 'Lets seeded users skip two-factor sign-in in preview'
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'AGENT_COPILOT_TOKEN',
    kind: 'token',
    purpose:
      'GitHub token (pull requests read and write) the queue works PRs with',
    rotation: {
      manual:
        'Create a fine-grained token on cdwr with pull requests read and write, write to agent-host /agent-queue, restart the agent container, revoke the old'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'AGENT_DESK_URL',
    kind: 'setting',
    purpose: 'Address of the CDWR Desk'
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'AGENT_GITHUB_APP_ID',
    kind: 'setting',
    purpose: 'Id of the GitHub App the queue acts as'
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'AGENT_GITHUB_APP_INSTALLATION_ID',
    kind: 'setting',
    purpose: 'Installation id of the GitHub App on the repo'
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'AGENT_GITHUB_APP_KEY',
    kind: 'signing-key',
    purpose: 'Private key of the queue GitHub App',
    rotation: {
      manual:
        'Generate a new private key in the GitHub App settings, write it to agent-host /agent-queue, restart the agent container, delete the old key'
    },
    expiry: { source: 'none' }
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'AGENT_QUEUE_LINEAR_CLIENT_ID',
    kind: 'setting',
    purpose: 'Client id of the queue Linear app'
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'AGENT_QUEUE_LINEAR_CLIENT_SECRET',
    kind: 'identity',
    purpose: 'Client secret of the queue Linear app',
    rotation: {
      manual:
        'Create a new client secret in the Linear app settings, write to agent-host /agent-queue, restart the agent container'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'AGENT_QUEUE_LINEAR_KEY',
    kind: 'api-key',
    purpose: 'Linear API key the queue uses as a fallback to the app login',
    rotation: {
      manual:
        'Create a new Linear API key, write to agent-host /agent-queue, restart the agent container, revoke the old'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'AGENT_SUPABASE_ANON_KEY',
    kind: 'setting',
    purpose: 'Public anon key of the agent-queue Supabase project'
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'AGENT_SUPABASE_SERVICE_KEY',
    kind: 'api-key',
    purpose: 'Service key the queue writes telemetry to Supabase with',
    rotation: {
      manual:
        'Roll the key in Supabase, write to agent-host /agent-queue, restart the agent container (cdwr agent rotate, COD-879)'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'AGENT_SUPABASE_URL',
    kind: 'setting',
    purpose: 'Address of the agent-queue Supabase project'
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'CLAUDE_CODE_OAUTH_TOKEN',
    kind: 'token',
    purpose: 'Claude Code login token the queue sessions run on',
    rotation: {
      manual:
        'Run claude setup-token, write the token to agent-host /agent-queue, restart the agent container'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'CMS_AGENT_API_KEY',
    kind: 'api-key',
    purpose: 'API key of the agent user in the host cms, for the devlog',
    rotation: {
      manual:
        'Regenerate the agent user API key in the cms admin, write to agent-host /agent-queue, restart the agent container'
    },
    expiry: { source: 'none' }
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'CMS_URL',
    kind: 'setting',
    purpose: 'Address of the host cms the devlog posts to'
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'DESK_FLY_TOKEN',
    kind: 'token',
    purpose: 'Fly org deploy token the desk restarts apps with',
    rotation: {
      manual:
        'fly tokens create, write to agent-host /agent-queue, restart the agent container, revoke the old (cdwr agent rotate fly, COD-876)'
    },
    expiry: { source: 'fly', tokenName: 'Desk org token' }
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'DESK_INFISICAL_CLIENT_ID',
    kind: 'setting',
    purpose: 'Client id of the Infisical identity the desk writes with'
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'DESK_INFISICAL_CLIENT_SECRET',
    kind: 'identity',
    purpose: 'Client secret of the Infisical identity the desk writes with',
    rotation: {
      manual:
        'Create a new client secret on the identity in Infisical, write to agent-host /agent-queue, restart the agent container, delete the old (cdwr agent rotate infisical, COD-878)'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'DESK_INFISICAL_PROJECT_ID',
    kind: 'setting',
    purpose: 'Infisical project id the desk writes to'
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'DESK_SUPABASE_DB_URL',
    kind: 'database-url',
    purpose: 'Database role the desk applies migrations with',
    rotation: {
      manual:
        'Reset the role password, write to agent-host /agent-queue, restart the agent container (cdwr agent rotate db-role, COD-877)'
    },
    expiry: { source: 'none' }
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'FLY_API_TOKEN',
    kind: 'token',
    purpose: 'Read-only Fly org token for platform reads',
    rotation: {
      manual:
        'fly tokens create, write to agent-host /agent-queue, restart the agent container, revoke the old (cdwr agent rotate fly, COD-876)'
    },
    expiry: { source: 'fly', tokenName: 'Readonly org token' }
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'PLATFORM_BACKUP_DATABASE_URL',
    kind: 'database-url',
    purpose: 'Database URL the nightly cms backup reads from',
    rotation: {
      manual:
        'Reset the role password, write to agent-host /agent-queue, restart the agent container (cdwr agent rotate db-role, COD-877)'
    },
    expiry: { source: 'none' }
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'PLATFORM_DATABASE_URL',
    kind: 'database-url',
    purpose: 'Read-only platform database URL for platform records',
    rotation: {
      manual:
        'Reset the role password, write to agent-host /agent-queue, restart the agent container (cdwr agent rotate db-role, COD-877)'
    },
    expiry: { source: 'none' }
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'PLATFORM_INFISICAL_CLIENT_ID',
    kind: 'setting',
    purpose: 'Client id of the read-only Infisical identity for platform reads'
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'PLATFORM_INFISICAL_CLIENT_SECRET',
    kind: 'identity',
    purpose: 'Client secret of the read-only Infisical identity',
    rotation: {
      manual:
        'Create a new client secret on the identity in Infisical, write to agent-host /agent-queue, restart the agent container, delete the old (cdwr agent rotate infisical, COD-878)'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'PLATFORM_INFISICAL_PROJECT_ID',
    kind: 'setting',
    purpose: 'Infisical project id for platform reads'
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'PLATFORM_SENTRY_AUTH_TOKEN',
    kind: 'token',
    purpose: 'Sentry token for reading platform errors',
    rotation: {
      manual:
        'Create a new Sentry auth token, write to agent-host /agent-queue, restart the agent container, revoke the old'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'PLATFORM_SENTRY_ORG',
    kind: 'setting',
    purpose: 'Sentry organization slug for platform reads'
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'PLATFORM_UMAMI_API_KEY',
    kind: 'api-key',
    purpose: 'Umami API key for platform statistics reads',
    rotation: {
      manual:
        'Create a new Umami API key, write to agent-host /agent-queue, restart the agent container, delete the old'
    },
    expiry: { source: 'unknown' }
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'PLATFORM_UMAMI_URL',
    kind: 'setting',
    purpose: 'Address of the Umami service for platform reads'
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'SENTRY_DSN',
    kind: 'dsn',
    purpose: 'Sentry DSN the app reports errors to',
    rotation: {
      manual:
        'Create a new DSN key in the Sentry project, write it to Infisical, redeploy, disable the old key'
    },
    expiry: { source: 'none' }
  },
  {
    project: 'agent-host',
    path: '/agent-queue',
    key: 'SLACK_WEBHOOK_URL',
    kind: 'webhook',
    purpose: 'Slack webhook the agent host posts notifications to',
    rotation: {
      manual:
        'Create a new webhook in Slack, write to agent-host /agent-queue, restart the agent container, remove the old'
    },
    expiry: { source: 'none' }
  }
];

export const environmentsOf = (
  project: ProjectName
): readonly SecretEnvironment[] => PROJECTS[project].environments;

const TENANT = '<tenant>';

/** Whether a folder path fits an entry's path pattern */
export const pathMatches = (pattern: string, path: string): boolean => {
  const want = pattern.split('/');
  const have = path.split('/');
  return (
    want.length === have.length &&
    want.every(
      (segment, i) =>
        segment === have[i] || (segment === TENANT && have[i] !== '')
    )
  );
};

/** The entry for a key where it lives, if the catalog knows it */
export const findEntry = (
  project: ProjectName,
  environment: SecretEnvironment,
  path: string,
  key: string,
  catalog: readonly CatalogEntry[] = CATALOG
): CatalogEntry | undefined =>
  catalog.find(
    (entry) =>
      entry.project === project &&
      entry.key === key &&
      (entry.environments ?? environmentsOf(project)).includes(environment) &&
      pathMatches(entry.path, path)
  );
