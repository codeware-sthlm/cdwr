/**
 * Longest deployment name accepted.
 *
 * A Fly app name is also a DNS label, so it cannot pass 63 characters. The
 * longest prefix a deployment name is put behind is a preview's
 * `cdwr-cms-pr-NNNNN-`, which takes 17 — leaving 46, and 40 keeps room for
 * pull requests past five digits and longer app names.
 */
export const MAX_DEPLOYMENT_NAME_LENGTH = 40;

/** Why a deployment name cannot be used. */
export type DeploymentNameIssue =
  | 'empty'
  | 'characters'
  | 'hyphens'
  | 'reserved'
  | 'too-long';

/**
 * Why a deployment name cannot be used, or `null` when it can.
 *
 * A deployment name is the folder a tenant's settings live under in Infisical,
 * and the suffix its Fly apps are named with: `demo` deploys as
 * `cdwr-cms-demo` in production and `cdwr-cms-pr-12-demo` in preview. So it has
 * to be a valid part of a Fly app name, and it must not be mistaken for one of
 * the names the deploy builds for itself.
 *
 * `_default` never passes, and that is intended — it is the reserved folder for
 * a deployment with no tenant, not a name anyone should give a tenant.
 */
export function deploymentNameIssue(name: string): DeploymentNameIssue | null {
  if (name === '') {
    return 'empty';
  }

  if (!/^[a-z0-9-]+$/.test(name)) {
    return 'characters';
  }

  // A DNS label cannot start or end with a hyphen, and a doubled one reads as
  // two names run together in an app name that is already hyphen-joined
  if (name.startsWith('-') || name.endsWith('-') || name.includes('--')) {
    return 'hyphens';
  }

  // `pr-12` in production deploys as `cdwr-cms-pr-12` — exactly the name pull
  // request 12's own preview is given. `pr-12-demo` collides the same way with
  // that preview's `demo` deployment
  if (/^pr-\d+(-|$)/.test(name)) {
    return 'reserved';
  }

  if (name.length > MAX_DEPLOYMENT_NAME_LENGTH) {
    return 'too-long';
  }

  return null;
}
