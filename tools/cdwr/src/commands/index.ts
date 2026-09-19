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
  { name: 'media', summary: 'Showcase imagery' },
  { name: 'release', summary: 'Publish the npm packages' }
];

/**
 * Every command, with a lazy import so the menu, help and completion never
 * load Fly, Infisical or Postgres code.
 */
export const ENTRIES: Entry[] = [
  {
    path: ['doctor'],
    summary: 'Check binaries, credentials and the shell setup',
    danger: 'read',
    load: () => import('./doctor').then((m) => m.default)
  }
];
