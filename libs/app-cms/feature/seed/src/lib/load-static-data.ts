import { manageSeedData } from '@codeware/shared/util/seed';
import { Payload } from 'payload';

import type {
  SeedData,
  SeedEnvironment,
  StaticSeedOptions
} from './seed-types';

/**
 * The committed seed data for a non-production environment.
 *
 * Generation used to live here: with no fixture found, the content was invented
 * with falso and written back into source. A fixture is always found, so that
 * branch never ran — and inventing content on a missed read is the worse
 * failure of the two, because the seed would quietly populate a database with
 * strangers where a test expects known tenants. It refuses instead.
 *
 * @param args.environment - Current deployment environment
 * @param args.options - Where remote media is read from
 * @param args.payload - Payload instance, for its logger
 * @returns The committed seed data for this environment
 * @throws In production, or when the data cannot be read
 */
export const loadStaticData = (args: {
  environment: SeedEnvironment;
  options?: StaticSeedOptions;
  payload: Payload;
}): SeedData => {
  const { environment, options, payload } = args;
  const { remoteDataUrl } = options ?? {};

  if (environment === 'production') {
    throw new Error('Static seeding is not allowed in production');
  }

  const seedData = manageSeedData.load(environment, {
    logger: {
      error: (msg) => payload.logger.error(msg),
      log: (msg) => payload.logger.info(msg),
      warn: (msg) => payload.logger.warn(msg)
    },
    remoteDataUrl
  });

  // `load` returns null both for a missing file and for one that failed schema
  // validation, and it has already logged which
  if (!seedData) {
    throw new Error(
      `No usable seed data for '${environment}'. A committed fixture in @codeware/shared/util/seed is missing or does not match the schema.`
    );
  }

  payload.logger.info(`[SEED] Loaded ${environment} seed data from file`);

  return seedData;
};
