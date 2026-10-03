import { belongsTo } from '../../services/fly';
import type { Environment } from '../../services/infisical';

export const BUILDER_PATH = '/apps/builder';
export const CMS_PATH = '/apps/cms';
export const TOKEN = 'BUILDER_TOKEN';
export const PREVIOUS = 'BUILDER_TOKEN_PREVIOUS';

/**
 * Where the rollover stands, derived from the three secrets in Infisical.
 *
 * - no previous (or previous === active) -> nothing staged yet
 * - cms still holds the previous token    -> staged: builder accepts both
 * - cms holds the active token            -> switched: only retiring is left
 */
export type Stage = 'not-started' | 'staged' | 'switched';

/** Stage before a run, and 'complete' once the run has finished */
export type Progress = Stage | 'complete';

export interface TokenState {
  /** BUILDER_TOKEN of the builder */
  active: string | undefined;
  /** BUILDER_TOKEN_PREVIOUS of the builder */
  previous: string | undefined;
  /** BUILDER_TOKEN of the cms */
  cms: string | undefined;
}

export function deriveStage({ active, previous, cms }: TokenState): Stage {
  if (!active) throw new Error(`${TOKEN} not found in ${BUILDER_PATH}`);
  if (!cms) throw new Error(`${TOKEN} not found in ${CMS_PATH}`);
  // A previous equal to the active one is a step 1 that stopped halfway
  if (!previous || previous === active) {
    if (cms !== active) {
      throw new Error(
        `The cms ${TOKEN} differs from the builder's, with no ${PREVIOUS} to explain it`
      );
    }
    return 'not-started';
  }
  if (cms === active) return 'switched';
  if (cms === previous) return 'staged';
  throw new Error(
    `The cms ${TOKEN} matches neither the builder's ${TOKEN} nor ${PREVIOUS}`
  );
}

export interface AffectedApps {
  /** The builder apps, which accept the token */
  builders: string[];
  /** The cms apps, which send it */
  cms: string[];
}

/**
 * Every deployed app that holds the token. Infisical's preview environment is
 * shared by all pull requests, so a preview rollover covers every pull
 * request's apps. A cms app is the base name with an optional pull request
 * and tenant suffix.
 */
export function classifyApps(
  names: string[],
  builderBaseName: string,
  cmsBaseName: string,
  environment: Environment
): AffectedApps {
  // Anything other than preview is production-shaped, as in the signature roll
  const bucket = environment === 'preview' ? 'preview' : 'production';
  const inEnvironment = (name: string) => belongsTo(name, bucket);
  const builderPattern = new RegExp(`^${builderBaseName}(-pr-\\d+)?$`);

  return {
    builders: names
      .filter((name) => inEnvironment(name) && builderPattern.test(name))
      .sort(),
    cms: names
      .filter(
        (name) =>
          inEnvironment(name) &&
          (name === cmsBaseName || name.startsWith(`${cmsBaseName}-`))
      )
      .sort()
  };
}

/** The steps still to run, in order, for the plan */
export function remainingSteps(stage: Stage): string[] {
  const steps: string[] = [];
  if (stage === 'not-started') {
    steps.push(
      `Step 1: keep the current token as ${PREVIOUS}, generate a new ${TOKEN} for the builder, restart the builder`
    );
  }
  if (stage === 'staged') {
    steps.push('Restart the builder, so it surely accepts both tokens');
  }
  if (stage !== 'switched') {
    steps.push(`Step 2: give the cms the new ${TOKEN}, restart every cms app`);
  }
  if (stage === 'switched') {
    steps.push('Restart every cms app, so none still sends the old token');
  }
  steps.push(`Step 3: retire ${PREVIOUS}, restart the builder`);
  return steps;
}
