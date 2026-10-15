import { consumeInviteCode } from '@codeware/app-cms/data-access';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  PLATFORM_EMAIL_BRAND,
  renderAccountExistsMail,
  renderSignupNoticeMail,
  sendPlatformMail,
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

/** Run `work` in a transaction of its own, committed only when it returns */
async function inTransaction<T>(
  payload: BasePayload,
  work: (transactionID: number | string) => Promise<T>
): Promise<T> {
  const transactionID = await payload.db.beginTransaction();
  if (transactionID === null || transactionID === undefined) {
    throw new Error('The database adapter started no transaction');
  }
  try {
    const result = await work(transactionID);
    await payload.db.commitTransaction(transactionID);
    return result;
  } catch (error) {
    await payload.db.rollbackTransaction(transactionID);
    throw error;
  }
}

/**
 * The new workspace and its first user, in one transaction with the invite
 * code they spend. Any failure rolls all three back, so a refused or broken
 * signup leaves the code unspent and nothing half-made behind.
 *
 * An address that already has an account is the one exception, and it is
 * found last, by the user insert itself: every other refusal comes first and
 * reads the same whoever owns the address. The code is then spent on its own,
 * so it cannot be tried again to learn that the address was taken.
 */
async function createWorkspace(
  payload: BasePayload,
  input: SignupInput,
  attemptsKey: string
) {
  try {
    return await inTransaction(payload, async (transactionID) => {
      const req = { transactionID };

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
          // The formatter drops letters like å and ö, which can leave the
          // slug empty; the validated site address is a safe slug already
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

      return { kind: 'created' as const, tenant, user };
    });
  } catch (error) {
    if (signupRefusal(error) !== 'email-taken') {
      throw error;
    }
  }

  await inTransaction(payload, (transactionID) =>
    consumeInviteCode(payload, input.code, { transactionID, attemptsKey })
  );
  return { kind: 'exists' as const };
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
  created: Extract<
    Awaited<ReturnType<typeof createWorkspace>>,
    { kind: 'created' }
  >
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
              environment: getEnv().DEPLOY_ENV,
              appName: process.env['FLY_APP_NAME'],
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

/** Tells the owner of an address that already has an account about the attempt */
async function sendAccountExists(payload: BasePayload, input: SignupInput) {
  const serverURL = (payload.config.serverURL ?? '').replace(/\/+$/, '');
  const admin = `${serverURL}${payload.config.routes.admin}`;

  await sendPlatformMail(payload, {
    to: input.email,
    label: 'account exists',
    mail: renderAccountExistsMail({
      locale: input.locale,
      brand: PLATFORM_EMAIL_BRAND,
      loginUrl: `${admin}/login`,
      resetUrl: `${admin}/forgot`
    })
  });
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
      // Drizzle wraps the database's own message as the error's cause
      const cause =
        error instanceof Error && error.cause
          ? ` (${String(error.cause)})`
          : '';
      payload.logger.error(`[signup] Signup failed: ${String(error)}${cause}`);
    }
    return refuse(reason);
  }

  // Both outcomes answer alike and at once; only the mail differs, and it is
  // sent after the answer so its time cannot tell them apart
  void (
    created.kind === 'created'
      ? sendMails(payload, parsed.input, created)
      : sendAccountExists(payload, parsed.input)
  ).catch((error) =>
    payload.logger.error(`[signup] Mails failed: ${String(error)}`)
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}
