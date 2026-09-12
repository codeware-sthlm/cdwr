#!/usr/bin/env tsx
/* eslint-disable @nx/enforce-module-boundaries */
import { cancel, intro, isCancel, select } from '@clack/prompts';

import { backupCmsDatabase } from './db-tools/lib/backup-db.js';
import { dropDatabase } from './db-tools/lib/drop-db.js';
import { restoreCmsDatabase } from './db-tools/lib/restore-db.js';
import { syncCmsStorage } from './db-tools/lib/sync-storage.js';
import { testMigration } from './db-tools/lib/test-migration.js';
import { showAppInfo } from './fly-tools/lib/app-info.js';
import { patchFlyConfig } from './fly-tools/lib/patch-config.js';
import { restartApp } from './fly-tools/lib/restart-app.js';
import { analysisMain } from './infisical/lib/analysis.js';
import { fetchAppTenantsMain } from './infisical/lib/fetch-app-tenants.js';
import { fetchDataMain } from './infisical/lib/fetch-data.js';
import { rotateSignatureSecretMain } from './infisical/lib/rotate-signature-secret.js';
import { rotateTenantKeyMain } from './infisical/lib/rotate-tenant-key.js';
import { generateShowcaseImages } from './media-tools/lib/generate-images.js';

interface Tool {
  name: string;
  description: string;
  action: () => Promise<void>;
}

const tools: Tool[] = [
  {
    name: 'backup-db',
    description: 'Backup CMS database from Supabase',
    action: backupCmsDatabase
  },
  {
    name: 'restore-db',
    description: 'Restore CMS database to Supabase',
    action: restoreCmsDatabase
  },
  {
    name: 'test-migration',
    description: 'Test latest migration against a production backup in Docker',
    action: testMigration
  },
  {
    name: 'sync-storage',
    description: 'Sync CMS media storage from Supabase S3',
    action: syncCmsStorage
  },
  {
    name: 'drop-db',
    description: 'Drop databases from Fly Postgres cluster',
    action: dropDatabase
  },
  {
    name: 'generate-images',
    description: 'Generate showcase imagery with Replicate (spends credit)',
    action: generateShowcaseImages
  },
  {
    name: 'restart-app',
    description: 'Restart Fly app machines',
    action: restartApp
  },
  {
    name: 'app-info',
    description: 'View Fly app information and machine states',
    action: showAppInfo
  },
  {
    name: 'patch-config',
    description: 'Apply TOML patches to Fly apps',
    action: patchFlyConfig
  },
  {
    name: 'infisical-tenants',
    description: 'Fetch application tenants from Infisical',
    action: fetchAppTenantsMain
  },
  {
    name: 'infisical-data',
    description: 'Fetch tenant data from Infisical',
    action: fetchDataMain
  },
  {
    name: 'infisical-analysis',
    description: 'Analyze Infisical configuration and secrets',
    action: analysisMain
  },
  {
    name: 'rotate-tenant-key',
    description: "Rotate a tenant's Payload API key in Payload and Infisical",
    action: rotateTenantKeyMain
  },
  {
    name: 'rotate-signature-secret',
    description: 'Roll over the shared request signature secret, step by step',
    action: rotateSignatureSecretMain
  }
];

async function main() {
  console.clear();
  intro('🛠️  Codeware CLI Tools');

  const selectedTool = await select({
    message: 'Select a tool to run:',
    options: tools.map((tool) => ({
      value: tool.name,
      label: tool.name,
      hint: tool.description
    }))
  });

  if (isCancel(selectedTool)) {
    cancel('Operation cancelled');
    process.exit(0);
  }

  const tool = tools.find((t) => t.name === selectedTool);
  if (!tool) {
    cancel('Tool not found');
    process.exit(1);
  }

  console.log(''); // Add spacing
  await tool.action();
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
