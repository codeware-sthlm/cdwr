import { defineCommand, readOnly } from '../../cli/command';
import { input } from '../../cli/inputs';
import { environmentInput } from '../../services/environment';
import { type Secret, maskValues, readFolders } from '../../services/infisical';

/** A folder's secrets as a plain record, key to value */
const toRecord = (secrets: Secret[]): Record<string, string> =>
  Object.fromEntries(
    secrets.map(({ secretKey, secretValue }) => [secretKey, secretValue])
  );

export default defineCommand({
  summary: 'Every tenant folder and its secrets',
  description:
    'Every folder under /tenants, recursively, one table per folder. Values are masked unless --reveal is given.',
  danger: 'read',
  needs: ['infisical'],
  inputs: {
    environment: environmentInput(),
    reveal: input.boolean({ prompt: 'Show secret values', flagOnly: true })
  },

  async plan(ctx, { environment }) {
    const folders = await ctx.ui.task(
      `Reading /tenants for ${environment}`,
      () => readFolders(environment, '/tenants'),
      (list) => `${list.length} folder(s)`
    );
    return readOnly(folders);
  },

  async apply(ctx, folders, { reveal }) {
    for (const folder of folders) {
      const values = toRecord(folder.secrets);
      ctx.ui.info(folder.path);
      ctx.ui.table(
        ['key', 'value'],
        Object.entries(reveal ? values : maskValues(values))
      );
    }
    return {
      summary: `${folders.length} folder(s) listed`,
      json: folders.map(({ path, secrets }) => {
        const values = toRecord(secrets);
        return { path, secrets: reveal ? values : maskValues(values) };
      })
    };
  }
});
