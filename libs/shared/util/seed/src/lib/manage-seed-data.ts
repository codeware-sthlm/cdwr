/**
 * Resolve JSON data via imports to make it available in the bundle.
 * Then it's easily accessible from different applications,
 * such as the web client.
 *
 * Important!
 * There must be no sensitive data in the JSON files,
 * and it's not recommended to use this for production data.
 */

import { withEnvVars } from '@codeware/shared/util/zod';

import { SeedDataSchema } from './schema';
import { seedData as getDevelopmentData } from './static-data/seed.development';
import { seedData as getPreviewData } from './static-data/seed.preview';

type Logger = {
  log: typeof console.log;
  warn: typeof console.warn;
  error: typeof console.error;
};

export type SeedOptions = {
  /**
   * Custom log functions.
   * @default console
   */
  logger?: Logger;

  /**
   * Remote URL to seed data files.
   *
   * This is used to be able to load seed files from a remote source.
   * It's required to make this endpoint publicly accessible.
   */
  remoteDataUrl: string | undefined;
};

/** Available seed data environments */
type SeedEnvironment = 'development' | 'preview';

const defaultLogger: Logger = {
  log: console.log,
  warn: console.warn,
  error: console.error
};

/**
 * Apply environment variable lookup to the schema to resolve the actual values
 */
const EnvSeedDataSchema = withEnvVars(SeedDataSchema);

/**
 * Manage static seed data.
 *
 * **Production environment is not supported.**
 */
export const manageSeedData = {
  /**
   * Load static seed data for a given environment.
   *
   * @param environment - The environment to load the seed data for.
   * @param options - Options for the load operation
   * @returns The seed data or null if the data is not valid or the environment is not supported.
   */
  load: <TData extends object>(
    environment: SeedEnvironment,
    options?: SeedOptions
  ) => loadSeedData<TData>(environment, options)
};

// Load seed data
const loadSeedData = <TData>(
  environment: SeedEnvironment,
  options?: SeedOptions
) => {
  const { logger = defaultLogger, remoteDataUrl } = options ?? {};

  let seedData: TData;

  switch (environment) {
    case 'development':
      seedData = getDevelopmentData(remoteDataUrl) as TData;
      break;
    case 'preview':
      seedData = getPreviewData(remoteDataUrl) as TData;
      break;
    default:
      logger.warn(`Static seed data for ${environment} not supported`);
      return null;
  }

  const { success, data, error } = EnvSeedDataSchema.safeParse(seedData);

  if (!success) {
    logger.warn(
      `Invalid seed data found in '${environment}' environment:\n${JSON.stringify(
        error.errors,
        null,
        2
      )}`
    );
    logger.warn('Verify the seed file has not been modified by mistake!');
    return null;
  }

  return data;
};
