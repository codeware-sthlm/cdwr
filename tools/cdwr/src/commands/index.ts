import type { Entry, Group } from '../cli/registry';

/** Groups in the order the menu and help show them */
export const GROUPS: Group[] = [
  { name: 'db', summary: 'CMS database: backups, restores, migrations' },
  { name: 'fly', summary: 'Fly apps: status, restarts, config patches' },
  {
    name: 'tenant',
    summary: 'Tenant lifecycle: provisioning, keys, site gate'
  },
  { name: 'infisical', summary: 'Look at what Infisical holds' },
  { name: 'signature', summary: 'Request signing between web and cms' },
  { name: 'media', summary: 'Showcase imagery' }
];

/**
 * Every command, with a lazy import so the menu, help and completion never
 * load Fly, Infisical or Postgres code. The summary and danger here are what
 * the menu shows; the command file repeats them for its own help.
 */
export const ENTRIES: Entry[] = [
  {
    path: ['db', 'backup'],
    summary: 'Back up the CMS database with pg_dump',
    danger: 'read',
    load: () => import('./db/backup').then((m) => m.default)
  },
  {
    path: ['db', 'restore'],
    summary: 'Restore a backup into an environment with psql',
    danger: 'destructive',
    load: () => import('./db/restore').then((m) => m.default)
  },
  {
    path: ['db', 'test-migration'],
    summary: 'Run pending migrations against a backup in Docker',
    danger: 'mutate',
    load: () => import('./db/test-migration').then((m) => m.default)
  },
  {
    path: ['db', 'sync-storage'],
    summary: 'Download the CMS media bucket',
    danger: 'read',
    load: () => import('./db/sync-storage').then((m) => m.default)
  },
  {
    path: ['db', 'drop'],
    summary: 'Drop databases from a Fly Postgres cluster',
    danger: 'destructive',
    load: () => import('./db/drop').then((m) => m.default)
  },
  {
    path: ['fly', 'info'],
    summary: 'Show apps, machines, certificates and secret names',
    danger: 'read',
    load: () => import('./fly/info').then((m) => m.default)
  },
  {
    path: ['fly', 'restart'],
    summary: 'Restart every machine of a Fly app, one at a time',
    danger: 'mutate',
    load: () => import('./fly/restart').then((m) => m.default)
  },
  {
    path: ['fly', 'patch'],
    summary: 'Merge a TOML patch into app configs and redeploy',
    danger: 'destructive',
    load: () => import('./fly/patch').then((m) => m.default)
  },
  {
    path: ['tenant', 'info'],
    summary: 'What a workspace is: details, site settings, content counts',
    danger: 'read',
    load: () => import('./tenant/info').then((m) => m.default)
  },
  {
    path: ['tenant', 'create'],
    summary: 'Create an empty workspace in Payload',
    danger: 'mutate',
    load: () => import('./tenant/create').then((m) => m.default)
  },
  {
    path: ['tenant', 'provision'],
    summary: "Set up a tenant's Infisical folders and API key from Payload",
    danger: 'spends-money',
    load: () => import('./tenant/provision').then((m) => m.default)
  },
  {
    path: ['tenant', 'apply-site'],
    summary: 'Fill a tenant from a site definition in the repository',
    danger: 'mutate',
    load: () => import('./tenant/apply-site').then((m) => m.default)
  },
  {
    path: ['tenant', 'diff-site'],
    summary: "How a tenant's site differs from a definition",
    danger: 'read',
    load: () => import('./tenant/diff-site').then((m) => m.default)
  },
  {
    path: ['tenant', 'rotate-key'],
    summary: "Rotate a tenant's Payload API key everywhere",
    danger: 'destructive',
    load: () => import('./tenant/rotate-key').then((m) => m.default)
  },
  {
    path: ['tenant', 'gate'],
    summary: "Open or close a tenant's site behind a shared password",
    danger: 'mutate',
    load: () => import('./tenant/gate').then((m) => m.default)
  },
  {
    path: ['infisical', 'tenants'],
    summary: 'Which tenants each app deploys for',
    danger: 'read',
    load: () => import('./infisical/tenants').then((m) => m.default)
  },
  {
    path: ['infisical', 'data'],
    summary: 'Every tenant folder and its secrets',
    danger: 'read',
    load: () => import('./infisical/data').then((m) => m.default)
  },
  {
    path: ['infisical', 'analysis'],
    summary: 'Deploy rules, app tenants and app secrets side by side',
    danger: 'read',
    load: () => import('./infisical/analysis').then((m) => m.default)
  },
  {
    path: ['signature', 'rotate'],
    summary: 'Roll over the request signature secret, step by step',
    danger: 'destructive',
    load: () => import('./signature/rotate').then((m) => m.default)
  },
  {
    path: ['media', 'generate-images'],
    summary: 'Generate showcase imagery with Replicate',
    danger: 'spends-money',
    load: () => import('./media/generate-images').then((m) => m.default)
  },
  {
    path: ['release'],
    summary: 'Version, changelog, tag and publish the npm packages',
    danger: 'destructive',
    load: () => import('./release').then((m) => m.default)
  },
  {
    path: ['doctor'],
    summary: 'Check binaries, credentials and the shell setup',
    danger: 'read',
    load: () => import('./doctor').then((m) => m.default)
  },
  {
    path: ['setup'],
    summary: 'Put cdwr on PATH and install shell completion',
    danger: 'mutate',
    load: () => import('./setup').then((m) => m.default)
  },
  {
    path: ['completion'],
    summary: 'Print the completion script for zsh, bash or fish',
    danger: 'read',
    load: () => import('./completion').then((m) => m.default)
  },
  {
    path: ['history'],
    summary: 'What changed things, when and where',
    danger: 'read',
    load: () => import('./history').then((m) => m.default)
  }
];
