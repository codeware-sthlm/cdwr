import { mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { defineCommand } from '../../cli/command';
import { backupName, backupsRoot } from '../../services/backups';
import { environmentInput } from '../../services/environment';
import { readSecrets } from '../../services/infisical';
import { childEnv, run } from '../../services/shell';

const REQUIRED = [
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_ENDPOINT'
] as const;

/** Count of an `aws s3 sync` run's `download:`/`copy:` lines */
export const countSynced = (stdout: string): number =>
  stdout
    .trim()
    .split('\n')
    .filter((line) => line.startsWith('download:') || line.startsWith('copy:'))
    .length;

export default defineCommand({
  summary: 'Download the CMS media bucket',
  description:
    'Syncs an environment’s S3 media bucket to a timestamped folder under backups/ with the AWS CLI.',
  danger: 'read',
  needs: ['aws', 'infisical'],
  inputs: {
    environment: environmentInput()
  },

  async plan(ctx, { environment }) {
    const secrets = await ctx.ui.task(
      `Reading S3 credentials for ${environment}`,
      () => readSecrets(environment, '/apps/cms'),
      () => 'S3 credentials read from Infisical'
    );
    const missing = REQUIRED.filter((key) => !secrets[key]);
    if (missing.length > 0) {
      throw new Error(
        `Missing S3 secrets in Infisical /apps/cms for ${environment}: ${missing.join(', ')}`
      );
    }
    const region = secrets['S3_REGION'] || 'eu-central-1';
    const dir = join(backupsRoot(ctx.root), backupName('storage', environment));

    return {
      steps: [
        `Sync s3://${secrets['S3_BUCKET']} to ${relative(ctx.root, dir)}/`
      ],
      target: { environment },
      data: {
        dir,
        bucket: secrets['S3_BUCKET'] as string,
        accessKeyId: secrets['S3_ACCESS_KEY_ID'] as string,
        secretAccessKey: secrets['S3_SECRET_ACCESS_KEY'] as string,
        endpoint: secrets['S3_ENDPOINT'] as string,
        region
      }
    };
  },

  async apply(
    ctx,
    { dir, bucket, accessKeyId, secretAccessKey, endpoint, region }
  ) {
    mkdirSync(dir, { recursive: true });
    const { stdout } = await ctx.ui.task(`Syncing s3://${bucket}`, () =>
      run(
        'aws',
        [
          's3',
          'sync',
          `s3://${bucket}`,
          dir,
          '--endpoint-url',
          endpoint,
          '--region',
          region,
          '--no-progress'
        ],
        {
          env: childEnv(ctx.env, {
            AWS_ACCESS_KEY_ID: accessKeyId,
            AWS_SECRET_ACCESS_KEY: secretAccessKey
          })
        }
      )
    );
    const count = countSynced(stdout);
    const where = relative(ctx.root, dir);
    return {
      summary:
        count > 0
          ? `${count} file(s) downloaded to ${where}`
          : `Nothing to sync; ${where} created`,
      json: { dir: where, files: count }
    };
  }
});
