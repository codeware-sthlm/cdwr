import type { Env } from '@codeware/app-cms/util/env-schema';
import type { Access, Plugin } from 'payload';

import { getFormsPlugin } from './plugins/get-forms-plugin';
import { getMultiTenantPlugin } from './plugins/get-multi-tenant-plugin';
import { getS3StoragePlugin } from './plugins/get-s3-storage-plugin';
import { getSeoPlugin } from './plugins/get-seo-plugin';

type Options = {
  /**
   * Tenant scoped access controls applied to the collections added by plugins.
   */
  access: {
    /** Client read access — editors, readers and tenant api keys */
    read: Access;
    /** Read access for records about people, which a reader must not see */
    readEditorsOnly: Access;
    /** Write access — admin users only */
    write: Access;
  };
};

/**
 * Get the Payload plugins.
 *
 * @param env - The environment variables
 * @param options - Access controls owned by the app
 * @returns Array of plugins
 */
export const getPlugins = (env: Env, { access }: Options): Array<Plugin> => [
  getFormsPlugin({ access }),
  getMultiTenantPlugin(),
  getSeoPlugin(),
  getS3StoragePlugin(env)
];
