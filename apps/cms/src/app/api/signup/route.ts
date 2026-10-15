import { consumeInviteCode } from '@codeware/app-cms/data-access';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  renderSignupNoticeMail,
  sendSignupEmails
} from '@codeware/app-cms/util/email';
import { clientIp } from '@codeware/shared/util/human-check';
import { NextRequest, NextResponse } from 'next/server';
import { type BasePayload, getPayload } from 'payload';

import { verifyEmailMail } from '../../../collections/users/verify-email';
import config from '../../../payload.config';
import { refuseUnlessHuman } from '../../../security/public-submit';
import {
  DeploymentTaken,
  REFUSAL_STATUS,
  SIGNUP_RATE_LIMIT,
  type SignupInput,
  type SignupRefusal,
  isSignupBody,
  parseSignup,
  signupRefusal
} from '../../../utils/signup';

const refuse = (refusal: SignupRefusal) =>
  NextResponse.json({ error: refusal }, { status: REFUSAL_STATUS[refusal] });

/**
 * The new workspace and its first user, in one transaction with the invite
 * code they spend. Any failure rolls all three back, so a refused or broken
 * signup leaves the code unspent and nothing half-made behind.
 */
async function createWorkspace(
  payload: BasePayload,
  input: SignupInput,
  attemptsKey: string
) {
  const transactionID = await payload.db.beginTransaction();
  if (transactionID === null || transactionID === undefined) {
    throw new Error('The database adapter started no transaction');
  }
  const req = { transactionID };

  try {
    await consumeInviteCode(payload, input.code, {
      transactionID,
      attemptsKey
    });

    const { totalDocs } = await payload.count({
      collection: 'tenants',
      where: {
        or: [
          { deployment: { equals: input.deployment } },
          { slug: { equals: input.deployment } }
        ]
      },
      overrideAccess: true,
      req
    });
    if (totalDocs > 0) {
      throw new DeploymentTaken();
    }

    // Pending until it is provisioned by hand; the api key is minted by the
    // collection's own hook
    const tenant = await payload.create({
      collection: 'tenants',
      data: {
        name: input.siteName,
        // The formatter drops letters like å and ö, which can leave the slug
        // empty; the validated site address is a safe slug already
        slug: input.deployment,
        supportedLocales: [input.locale],
        deployment: input.deployment,
        status: 'pending'
      },
      overrideAccess: true,
      req
    });

    const user = await payload.create({
      collection: 'users',
      data: {
        name: input.name,
        email: input.email,
        password: input.password,
        role: 'user',
        tenants: [{ tenant: tenant.id, role: 'admin' }]
      },
      // Unverified, and mailed only once the transaction has committed
      context: { signup: true },
      disableVerificationEmail: true,
      overrideAccess: true,
      req
    });

    await payload.db.commitTransaction(transactionID);
    return { tenant, user };
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID);
    throw error;
  }
}

/** The address that gets a notice of each signup, if one is set */
async function noticeAddress(payload: BasePayload): Promise<string | null> {
  const { docs } = await payload.find({
    collection: 'platform-settings',
    depth: 0,
    limit: 1,
    overrideAccess: true
  });
  return docs[0]?.signupNotifyEmail || null;
}

/**
 * The verification mail to the new user and the notice to the platform.
 * Sent after the commit, so a signup that failed mails nobody; a mail that
 * fails is logged and never undoes the signup.
 */
async function sendMails(
  payload: BasePayload,
  input: SignupInput,
  created: Awaited<ReturnType<typeof createWorkspace>>
) {
  const { tenant, user } = created;

  // The create result hides the token, so it is read back on its own
  const stored = await payload.findByID({
    collection: 'users',
    id: user.id,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true
  });
  const token = stored._verificationToken;
  if (!token) {
    payload.logger.error(
      `[signup] User ${user.id} has no verification token; no mail sent`
    );
    return;
  }

  const to = await noticeAddress(payload).catch(() => null);
  const serverURL = (payload.config.serverURL ?? '').replace(/\/+$/, '');

  await sendSignupEmails(payload, {
    verify: {
      to: input.email,
      mail: verifyEmailMail(payload, {
        token,
        name: input.name,
        locale: input.locale
      })
    },
    ...(to
      ? {
          notice: {
            to,
            mail: renderSignupNoticeMail({
              locale: 'en',
              tenantName: input.siteName,
              deployment: input.deployment,
              userName: input.name,
              userEmail: input.email,
              adminUrl: `${serverURL}${payload.config.routes.admin}/collections/tenants/${tenant.id}`
            })
          }
        }
      : {})
  });

  if (!to) {
    payload.logger.info(
      `[signup] New workspace '${input.deployment}' (${tenant.id}); no notice address is set`
    );
  }
}

/**
 * Self-serve signup: an invite code, a person and a site name become a
 * pending workspace and its first admin.
 *
 * Only the host serves it. It is refused unless a person filled the form in,
 * with a limit of its own well below the forms', and the code is checked and
 * spent inside the same transaction that creates the workspace.
 */
export async function POST(request: NextRequest) {
  if (getEnv().APP_MODE.type !== 'host') {
    return new NextResponse(null, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse('invalid');
  }
  if (!isSignupBody(body)) {
    return refuse('invalid');
  }

  const parsed = parseSignup(body);
  if (!parsed.ok) {
    return refuse(parsed.refusal);
  }

  const refusal = await refuseUnlessHuman(request, 'signup', body.humanCheck, {
    limit: SIGNUP_RATE_LIMIT
  });
  if (refusal) {
    return refusal;
  }

  const payload = await getPayload({ config });
  const attemptsKey = `${clientIp(request.headers) ?? 'unknown'}:invite-code`;

  let created: Awaited<ReturnType<typeof createWorkspace>>;
  try {
    created = await createWorkspace(payload, parsed.input, attemptsKey);
  } catch (error) {
    const reason = signupRefusal(error);
    if (reason === 'failed') {
      payload.logger.error(`[signup] Signup failed: ${String(error)}`);
    }
    return refuse(reason);
  }

  await sendMails(payload, parsed.input, created).catch((error) =>
    payload.logger.error(`[signup] Mails failed: ${String(error)}`)
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}
