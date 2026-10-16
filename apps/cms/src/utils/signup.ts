import { InviteCodeRefused } from '@codeware/app-cms/data-access';
import { FLY_CONFIG_APP_NAMES } from '../provisioning/tenant-apps';
import type { HumanCheckFields } from '@codeware/shared/util/human-check';
import { deploymentNameIssue } from '@codeware/shared/util/pure';
import {
  type BasePayload,
  type PayloadRequest,
  ValidationError
} from 'payload';

/** Signups per address and window, far below the forms' shared limit */
export const SIGNUP_RATE_LIMIT = 5;

const MIN_PASSWORD = 10;
const MAX_PASSWORD = 128;
const MAX_TEXT = 100;

/** A signup that passed the shape checks; the code is checked in the transaction */
export type SignupInput = {
  code: string;
  name: string;
  email: string;
  password: string;
  siteName: string;
  deployment: string;
  locale: 'en' | 'sv';
};

/** Why a signup was refused, for the page to word in the visitor's language */
export type SignupRefusal =
  | 'invalid'
  | 'password'
  | 'deployment'
  | 'code'
  | 'closed'
  | 'throttled'
  | 'email-taken'
  | 'deployment-taken'
  | 'name-taken'
  | 'failed';

export type SignupBody = {
  humanCheck?: HumanCheckFields;
} & Record<string, unknown>;

/** A JSON body that is an object, the only shape a signup can be */
export const isSignupBody = (value: unknown): value is SignupBody =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A site address that an existing workspace already answers to, by its
 * deployment or by its slug: older workspaces may predate the deployment
 * field, and their apps and folders are named after the slug.
 */
export class DeploymentTaken extends Error {
  constructor() {
    super('The site address is taken');
    this.name = 'DeploymentTaken';
  }
}

/** The host app's name, which tenant apps and their addresses are named after */
export const hostAppName = (): string =>
  process.env['FLY_APP_NAME'] ?? FLY_CONFIG_APP_NAMES.cms;

/** Whether self-serve signup is switched on in the platform settings */
export async function isSignupOpen(payload: BasePayload): Promise<boolean> {
  const { docs } = await payload.find({
    collection: 'platform-settings',
    depth: 0,
    limit: 1,
    overrideAccess: true
  });
  return docs[0]?.signupOpen === true;
}

/**
 * Whether a workspace already answers to this site address, by its
 * deployment or its slug. Pass `req` to read inside a transaction.
 */
export async function isDeploymentTaken(
  payload: BasePayload,
  deployment: string,
  req?: Partial<PayloadRequest>
): Promise<boolean> {
  const { totalDocs } = await payload.count({
    collection: 'tenants',
    where: {
      or: [
        { deployment: { equals: deployment } },
        { slug: { equals: deployment } }
      ]
    },
    overrideAccess: true,
    ...(req ? { req } : {})
  });
  return totalDocs > 0;
}

const text = (value: unknown, max = MAX_TEXT): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed && trimmed.length <= max ? trimmed : null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The signup fields, or why they cannot be accepted. Nothing here touches
 * the database: the invite code and the uniqueness checks come later, inside
 * the transaction.
 */
export function parseSignup(
  body: SignupBody
): { ok: true; input: SignupInput } | { ok: false; refusal: SignupRefusal } {
  const code = text(body['code'], 64);
  const name = text(body['name']);
  const email = text(body['email'], 254)?.toLowerCase() ?? null;
  const siteName = text(body['siteName']);
  const deployment = text(body['deployment'], 64);
  const password = typeof body['password'] === 'string' ? body['password'] : '';

  if (!code || !name || !email || !EMAIL.test(email) || !siteName) {
    return { ok: false, refusal: 'invalid' };
  }
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    return { ok: false, refusal: 'password' };
  }
  if (!deployment || deploymentNameIssue(deployment) !== null) {
    return { ok: false, refusal: 'deployment' };
  }

  return {
    ok: true,
    input: {
      code,
      name,
      email,
      password,
      siteName,
      deployment,
      locale: body['locale'] === 'sv' ? 'sv' : 'en'
    }
  };
}

/** The status each refusal answers with */
export const REFUSAL_STATUS = {
  invalid: 400,
  password: 400,
  deployment: 400,
  code: 400,
  closed: 403,
  throttled: 429,
  'email-taken': 409,
  'deployment-taken': 409,
  'name-taken': 409,
  failed: 500
} as const satisfies Record<SignupRefusal, number>;

/**
 * What a failed signup transaction tells the visitor.
 *
 * An unknown, expired or used-up code all read the same, so a guess learns
 * nothing about which codes exist. A taken email is told, since only someone
 * holding a valid code gets this far. Anything unexpected is `failed`.
 */
export function signupRefusal(error: unknown): SignupRefusal {
  if (error instanceof InviteCodeRefused) {
    switch (error.verdict) {
      case 'closed':
        return 'closed';
      case 'throttled':
        return 'throttled';
      case 'unknown':
      case 'expired':
      case 'exhausted':
        return 'code';
    }
  }

  if (error instanceof DeploymentTaken) {
    return 'deployment-taken';
  }

  if (error instanceof ValidationError) {
    const paths = error.data.errors.map(({ path }) => path);
    if (paths.includes('email')) return 'email-taken';
    if (paths.includes('deployment')) return 'deployment-taken';
    if (paths.includes('slug') || paths.includes('name')) return 'name-taken';
  }

  return 'failed';
}
