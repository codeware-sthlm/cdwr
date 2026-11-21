import { randomBytes } from 'node:crypto';

import { belongsTo } from '../../services/fly';
import type { Environment } from '../../services/infisical';

/** Folder holding the shared signature secret, imported by headless (and the retired web) */
export const SECRET_PATH = '/apps/cms/signature';
export const ACTIVE = 'SIGNATURE_SECRET';
export const PREVIOUS = 'SIGNATURE_SECRET_PREVIOUS';

/**
 * The retired Remix web app, still signing in production until its Fly apps are
 * destroyed. It read Infisical at boot, so a restart is all it needs
 */
export const RETIRED_SIGNER_BASE_NAME = 'cdwr-web';

/**
 * Where the rollover stands, derived from what exists in Infisical.
 *
 * There is no stored progress marker - the two secrets are the state:
 * - no previous            -> nothing started
 * - previous === active    -> previous is staged, active not yet replaced
 * - previous !== active    -> active is new, clients are rolling over
 */
export type Stage = 'not-started' | 'previous-staged' | 'rolling-over';

export function deriveStage(
  active: string | undefined,
  previous: string | undefined
): Stage {
  if (!active) throw new Error(`${ACTIVE} not found in ${SECRET_PATH}`);
  if (!previous) return 'not-started';
  return previous === active ? 'previous-staged' : 'rolling-over';
}

/** Generate a new HMAC signing secret */
export const generateSecret = (): string => randomBytes(32).toString('hex');

export interface AffectedApps {
  /** Apps that verify signatures, and must accept a secret before the signers sign with it */
  verifiers: string[];
  /** Signers that read the secret from Infisical at boot, so a restart picks up a new one */
  bootSigners: string[];
  /** Signers that carry the secret as a Fly secret, so a new one is set on each */
  flySigners: string[];
}

/** Signer base names, by how each gets the secret */
export interface SignerBaseNames {
  boot: readonly string[];
  fly: readonly string[];
}

/**
 * Find every deployed app that reads the signature secret.
 *
 * cms host verifies, headless (and the retired web) signs. Tenant-scoped cms deployments are skipped -
 * they run in tenant mode, where the secret is not part of `APP_MODE`.
 */
export function classifyApps(
  names: string[],
  cmsBaseName: string,
  signerBaseNames: SignerBaseNames,
  environment: Environment
): AffectedApps {
  // Anything other than preview is treated as production-shaped, matching
  // how a deploy names apps for `development` too
  const bucket = environment === 'preview' ? 'preview' : 'production';
  const belongsToEnvironment = (name: string) => belongsTo(name, bucket);
  const verifierPattern = new RegExp(`^${cmsBaseName}(-pr-\\d+)?$`);
  const signersOf = (bases: readonly string[]) =>
    names
      .filter(
        (name) =>
          belongsToEnvironment(name) &&
          bases.some((base) => name.startsWith(`${base}-`))
      )
      .sort();

  return {
    // The host deployment is the base name, with no tenant suffix
    verifiers: names
      .filter(
        (name) => belongsToEnvironment(name) && verifierPattern.test(name)
      )
      .sort(),
    bootSigners: signersOf(signerBaseNames.boot),
    flySigners: signersOf(signerBaseNames.fly)
  };
}

/** The rollover steps not yet done, in order, for the note and the plan */
export function remainingSteps(stage: Stage): string[] {
  const steps: string[] = [];
  if (stage === 'not-started') {
    steps.push(`Stage the current secret as ${PREVIOUS}, restart cms`);
  }
  if (stage !== 'rolling-over') {
    steps.push(
      `Generate a new ${ACTIVE}, restart cms, then set it on the signers`
    );
  }
  steps.push(`Retire ${PREVIOUS}, restart cms`);
  return steps;
}
