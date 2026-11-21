import { randomBytes } from 'node:crypto';

import { getSiteSettingsForTenant } from '@codeware/app-cms/data-access';
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  STATS_TEAM_ROLE,
  STATS_USER_ROLE,
  type StatsAccountState,
  UmamiNotFoundError,
  UmamiUserExistsError,
  getUmamiAdminApi
} from '@codeware/app-cms/feature/site-stats';
import {
  type EmailBrand,
  PLATFORM_EMAIL_BRAND,
  emailBrandFromSettings,
  renderStatsAccountMail
} from '@codeware/app-cms/util/email';
import { getUserTenantIDs, hasRole } from '@codeware/app-cms/util/misc';
import { BUILT_IN_TOKENS } from '@codeware/shared/theme';
import type { SupportedLocale } from '@codeware/shared/util/i18n';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import {
  type Endpoint,
  type PayloadRequest,
  addDataAndFileToRequest
} from 'payload';
import { z } from 'zod';

import { getSingleTenantIdFromHeaders } from '../components/admin/utils/tenant-where';

const bodySchema = z.object({ action: z.enum(['create', 'reset']) });

/** 20 URL-safe characters */
const newPassword = () => randomBytes(15).toString('base64url');

const refuse = (status: StatusCodes, error = getReasonPhrase(status)) =>
  Response.json({ error }, { status });

/** A workspace admin; system users manage no statistics login */
const isWorkspaceAdmin = (
  user: Parameters<typeof hasRole>[0],
  tenantId: number
) =>
  !!user &&
  !hasRole(user, 'system-user') &&
  getUserTenantIDs(user, 'admin').includes(tenantId);

/**
 * The caller's statistics account state in a workspace, with what the state
 * was read from. `none` unless the caller is an admin of the workspace, the
 * workspace has a statistics website and team, and Umami can be managed.
 */
export async function resolveStatsAccount(
  req: PayloadRequest,
  tenantId: number,
  tenant: { statsWebsiteId?: string | null; statsTeamId?: string | null }
): Promise<{ state: StatsAccountState; umamiUserId?: string }> {
  const { user } = req;
  if (
    !user ||
    !isWorkspaceAdmin(user, tenantId) ||
    !tenant.statsWebsiteId ||
    !tenant.statsTeamId
  ) {
    return { state: 'none' };
  }

  const admin = await getUmamiAdminApi(getEnv().UMAMI_URL);
  if (admin.status !== 'ready') {
    return { state: 'none' };
  }

  // Field access hides the group from the request's user, so it is read past it
  const stored = await req.payload.findByID({
    collection: 'users',
    id: user.id,
    depth: 0,
    select: { statsAccount: true },
    overrideAccess: true,
    disableErrors: true
  });
  const umamiUserId = stored?.statsAccount?.umamiUserId;

  return umamiUserId ? { state: 'ready', umamiUserId } : { state: 'available' };
}

const isSupportedLocale = (value: unknown): value is SupportedLocale =>
  value === 'sv' || value === 'en';

/** The workspace's brand for the mail; the platform's when settings cannot be read */
async function brandOf(
  req: PayloadRequest,
  tenantId: number
): Promise<{ brand: EmailBrand; fallbackLocale?: unknown }> {
  const serverURL = (req.payload.config.serverURL ?? '').replace(/\/+$/, '');
  try {
    const settings = await getSiteSettingsForTenant(req.payload, tenantId, {
      depth: 1
    });
    if (settings) {
      return {
        brand: emailBrandFromSettings(settings, {
          serverURL,
          builtInTokens: BUILT_IN_TOKENS,
          fallbackName: PLATFORM_EMAIL_BRAND.name
        }),
        fallbackLocale: settings.general.defaultLocale
      };
    }
  } catch (error) {
    // Branding must never stop the login being sent
    req.payload.logger.warn(
      `[siteStats] Could not read site settings, using the platform brand: ${String(error)}`
    );
  }
  return { brand: PLATFORM_EMAIL_BRAND };
}

/**
 * Creates or resets the caller's Umami login for the selected workspace and
 * mails it. The password exists only here and in that mail.
 *
 * Allowed when `GET /site-stats` would answer `available` (create) or
 * `ready` (reset). The tenant comes from the selection cookie, so the
 * caller's admin role in it is checked, not assumed.
 */
export const siteStatsAccountEndpoint: Endpoint = {
  path: '/site-stats/account',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const user = req.user ?? null;
    if (!user) {
      return refuse(StatusCodes.UNAUTHORIZED);
    }
    // A workspace api key has no mailbox
    if (user.collection !== 'users') {
      return refuse(StatusCodes.FORBIDDEN);
    }

    await addDataAndFileToRequest(req);
    const body = bodySchema.safeParse(req.data);
    if (!body.success) {
      return refuse(StatusCodes.BAD_REQUEST);
    }
    const { action } = body.data;

    const tenantId = getSingleTenantIdFromHeaders(req.headers, user);
    if (tenantId === null) {
      return refuse(StatusCodes.FORBIDDEN);
    }
    const tenant = await req.payload.findByID({
      collection: 'tenants',
      id: tenantId,
      depth: 0,
      select: { statsWebsiteId: true, statsTeamId: true },
      overrideAccess: true,
      disableErrors: true,
      req
    });
    if (!tenant) {
      return refuse(StatusCodes.FORBIDDEN);
    }

    const { state, umamiUserId } = await resolveStatsAccount(
      req,
      tenantId,
      tenant
    );
    if (state === 'none') {
      return refuse(StatusCodes.FORBIDDEN);
    }
    if (
      (action === 'create' && state !== 'available') ||
      (action === 'reset' && state !== 'ready')
    ) {
      return refuse(StatusCodes.CONFLICT);
    }

    const { UMAMI_URL: umamiUrl } = getEnv();
    const admin = await getUmamiAdminApi(umamiUrl);
    const teamId = tenant.statsTeamId;
    if (admin.status !== 'ready' || !umamiUrl || !teamId) {
      return refuse(StatusCodes.FORBIDDEN);
    }

    let username = user.email.toLowerCase();
    const password = newPassword();

    try {
      let accountId = umamiUserId;
      let mode = action;
      if (mode === 'reset' && accountId) {
        try {
          // The mail names the login Umami has, which may differ from the cms email
          username = (await admin.umami.getUser(accountId)).username;
          await admin.umami.setPassword(accountId, password);
        } catch (error) {
          if (!(error instanceof UmamiNotFoundError)) {
            throw error;
          }
          // The stored account is gone from Umami: forget it and create a new one
          req.payload.logger.warn(
            `stats account reset: stored Umami user ${accountId} not found, creating a new one, tenant ${tenantId}`
          );
          await req.payload.update({
            collection: 'users',
            id: user.id,
            data: { statsAccount: { umamiUserId: null, createdAt: null } },
            context: { statsAccountWrite: true },
            overrideAccess: true
          });
          accountId = undefined;
          mode = 'create';
        }
      }
      if (mode === 'create') {
        const created = await admin.umami.createUser({
          username,
          password,
          role: STATS_USER_ROLE
        });
        accountId = created.id;
        try {
          // Without the seed context the users hooks ask for a workspace on every update
          await req.payload.update({
            collection: 'users',
            id: user.id,
            data: {
              statsAccount: {
                umamiUserId: created.id,
                createdAt: new Date().toISOString()
              }
            },
            // Only the tenant hooks let this through: the write touches statsAccount, never tenants
            context: { statsAccountWrite: true },
            overrideAccess: true
          });
        } catch (storeError) {
          // Without the stored id the account is unreachable and the username stays taken
          req.payload.logger.warn(
            `stats account create: storing the id failed, deleting Umami user ${created.id}, tenant ${tenantId}`
          );
          try {
            await admin.umami.deleteUser(created.id);
          } catch (cleanupError) {
            req.payload.logger.error(
              `stats account create: deleting Umami user ${created.id} failed: ${String(cleanupError)}`
            );
          }
          throw storeError;
        }
      }
      if (!accountId) {
        return refuse(StatusCodes.CONFLICT);
      }
      await admin.umami.addTeamUser(teamId, accountId, STATS_TEAM_ROLE);

      // A downgrade that landed meanwhile must not leave the access restored
      const current = await req.payload.findByID({
        collection: 'users',
        id: user.id,
        depth: 0,
        overrideAccess: true,
        disableErrors: true
      });
      if (!isWorkspaceAdmin(current, tenantId)) {
        try {
          await admin.umami.removeTeamUser(teamId, accountId);
        } catch (cleanupError) {
          req.payload.logger.error(
            `stats account ${mode}: removing Umami user ${accountId} from the team failed: ${String(cleanupError)}`
          );
        }
        return refuse(StatusCodes.FORBIDDEN);
      }

      const { brand, fallbackLocale } = await brandOf(req, tenantId);
      const requested = req.i18n?.language;
      const locale: SupportedLocale = isSupportedLocale(requested)
        ? requested
        : isSupportedLocale(fallbackLocale)
          ? fallbackLocale
          : 'en';
      const mail = renderStatsAccountMail({
        locale,
        brand,
        loginUrl: `${umamiUrl.replace(/\/+$/, '')}/login`,
        username,
        password
      });
      await req.payload.sendEmail({ to: user.email, ...mail });

      req.payload.logger.info(
        `stats account ${mode}: user ${accountId} tenant ${tenantId}`
      );
      return Response.json(
        { ok: true },
        { status: StatusCodes.OK, headers: { 'cache-control': 'no-store' } }
      );
    } catch (error) {
      if (error instanceof UmamiUserExistsError) {
        req.payload.logger.warn(
          `stats account ${action}: username taken in Umami, tenant ${tenantId}`
        );
        return refuse(StatusCodes.CONFLICT, 'conflict');
      }
      req.payload.logger.error(
        `stats account ${action} failed, tenant ${tenantId}: ${String(error)}`
      );
      return refuse(StatusCodes.BAD_GATEWAY);
    }
  }
};
