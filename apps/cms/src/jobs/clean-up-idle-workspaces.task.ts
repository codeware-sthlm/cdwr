import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  PLATFORM_EMAIL_BRAND,
  renderIdleWorkspaceSummaryMail,
  renderIdleWorkspaceWarningMail,
  sendPlatformMail
} from '@codeware/app-cms/util/email';
import type { Tenant, User } from '@codeware/shared/util/payload-types';
import type { BasePayload, TaskConfig } from 'payload';

import { workspaceHasPages } from '../security/first-site-tenant';

import { decideIdleWorkspace } from './idle-workspaces';

type SweepResult =
  | { skipped: 'off' }
  | { warned: number; deleted: number; reported: number; unwarned: number };

const CONTEXT = { idleCleanup: true };

const tenantIdOf = (tenant: number | Tenant) =>
  typeof tenant === 'number' ? tenant : tenant.id;

/** The users that belong to the workspace, with their other workspaces */
async function workspaceUsers(payload: BasePayload, tenantId: number) {
  const { docs } = await payload.find({
    collection: 'users',
    where: { 'tenants.tenant': { equals: tenantId } },
    depth: 0,
    pagination: false,
    overrideAccess: true
  });

  return docs.map((user) => {
    const rows = (user.tenants ?? []).filter(
      (row) => tenantIdOf(row.tenant) === tenantId
    );
    return {
      user,
      isAdmin: rows.some((row) => row.role === 'admin'),
      hasOtherWorkspace: (user.tenants ?? []).some(
        (row) => tenantIdOf(row.tenant) !== tenantId
      )
    };
  });
}

/** Warn the workspace's verified admins; returns how many mails were sent */
async function warnAdmins(
  payload: BasePayload,
  tenant: Tenant,
  deleteOn: Date
): Promise<{ admins: number; sent: number }> {
  const admins = (await workspaceUsers(payload, tenant.id)).filter(
    ({ isAdmin, user }) => isAdmin && user._verified
  );

  const serverURL = (payload.config.serverURL ?? '').replace(/\/+$/, '');
  const mail = renderIdleWorkspaceWarningMail({
    locale: tenant.supportedLocales[0] ?? 'en',
    workspaceName: tenant.name,
    deleteOn,
    brand: PLATFORM_EMAIL_BRAND,
    adminUrl: `${serverURL}${payload.config.routes.admin}`
  });

  let sent = 0;
  for (const { user } of admins) {
    const ok = await sendPlatformMail(payload, {
      to: user.email,
      mail,
      label: 'idle workspace warning'
    });
    if (ok) {
      sent += 1;
    }
  }

  return { admins: admins.length, sent };
}

/**
 * Remove the workspace, then the users who belonged to nothing else.
 *
 * The users are collected first: deleting the workspace makes the
 * multi-tenant plugin strip it from their memberships, after which a user who
 * only had this workspace can no longer be told from any other.
 *
 * @returns Number of users deleted
 */
async function deleteWorkspace(
  payload: BasePayload,
  tenantId: number
): Promise<number> {
  const orphans = (await workspaceUsers(payload, tenantId))
    .filter(({ hasOtherWorkspace, user }) => {
      return !hasOtherWorkspace && user.role !== 'system-user';
    })
    .map(({ user }) => user.id);

  await payload.delete({
    collection: 'tenants',
    id: tenantId,
    overrideAccess: true,
    context: CONTEXT
  });

  for (const id of orphans) {
    await payload.delete({
      collection: 'users',
      id,
      overrideAccess: true,
      context: CONTEXT
    });
  }

  return orphans.length;
}

/**
 * Warn and delete pending workspaces that never got a page.
 *
 * Off unless the platform sets a number of idle days. A workspace with
 * provisioning traces is only reported: deleting it would leave its apps and
 * stats behind. A failure on one workspace is logged and the rest go on.
 */
export async function sweepIdleWorkspaces(
  payload: BasePayload,
  now: Date
): Promise<SweepResult> {
  const { docs: settingsDocs } = await payload.find({
    collection: 'platform-settings',
    depth: 0,
    limit: 1,
    overrideAccess: true
  });
  const settings = settingsDocs[0];
  const idleDays = settings?.idleWorkspaceDays;

  if (!idleDays) {
    return { skipped: 'off' };
  }

  const { docs: tenants } = await payload.find({
    collection: 'tenants',
    where: { status: { equals: 'pending' } },
    depth: 0,
    pagination: false,
    overrideAccess: true
  });

  const warned: Array<{ name: string; deleteOn: Date }> = [];
  const deleted: Array<{ name: string; usersDeleted: number }> = [];
  const provisioned: Array<{ name: string }> = [];
  const unwarned: Array<{ name: string; reason: 'no-admin' | 'mail-failed' }> =
    [];

  const markHandled = (id: number) =>
    payload.update({
      collection: 'tenants',
      id,
      data: { idleWarnedAt: now.toISOString() },
      overrideAccess: true,
      context: CONTEXT
    });

  for (const tenant of tenants) {
    try {
      const hasPages = await workspaceHasPages(payload, tenant.id);

      if (hasPages && tenant.idleWarnedAt) {
        await payload.update({
          collection: 'tenants',
          id: tenant.id,
          data: { idleWarnedAt: null },
          overrideAccess: true,
          context: CONTEXT
        });
        continue;
      }

      const decision = decideIdleWorkspace(
        { ...tenant, hasPages },
        idleDays,
        now
      );

      if (decision.action === 'warn') {
        const { admins, sent } = await warnAdmins(
          payload,
          tenant,
          decision.deleteOn
        );
        if (sent) {
          await markHandled(tenant.id);
          warned.push({ name: tenant.name, deleteOn: decision.deleteOn });
        } else {
          // Never marked, so it can never reach the delete branch
          payload.logger.warn(
            `[cleanUpIdleWorkspaces] Workspace ${tenant.id} could not be warned: ${admins ? 'mail failed' : 'no verified admin'}`
          );
          unwarned.push({
            name: tenant.name,
            reason: admins ? 'mail-failed' : 'no-admin'
          });
        }
      } else if (decision.action === 'delete') {
        const usersDeleted = await deleteWorkspace(payload, tenant.id);
        deleted.push({ name: tenant.name, usersDeleted });
      } else if (decision.action === 'report') {
        await markHandled(tenant.id);
        provisioned.push({ name: tenant.name });
      }
    } catch (error) {
      payload.logger.error(
        `[cleanUpIdleWorkspaces] Workspace ${tenant.id} could not be handled: ${String(error)}`
      );
    }
  }

  const to = settings?.signupNotifyEmail;

  if (
    to &&
    (warned.length || deleted.length || provisioned.length || unwarned.length)
  ) {
    const serverURL = (payload.config.serverURL ?? '').replace(/\/+$/, '');
    await sendPlatformMail(payload, {
      to,
      label: 'idle workspace summary',
      mail: renderIdleWorkspaceSummaryMail({
        locale: 'en',
        warned,
        deleted,
        provisioned,
        unwarned,
        adminUrl: `${serverURL}${payload.config.routes.admin}`,
        brand: PLATFORM_EMAIL_BRAND
      })
    });
  }

  return {
    warned: warned.length,
    deleted: deleted.length,
    reported: provisioned.length,
    unwarned: unwarned.length
  };
}

/**
 * Nightly cleanup of self-serve workspaces that never got a page.
 *
 * Runs through the nightly queue like the other sweeps. Only the host
 * schedules it, so tenant apps never queue a second run and the links in the
 * mails are the host's.
 */
export const cleanUpIdleWorkspacesTask: TaskConfig<{
  input: Record<string, never>;
  output: {
    skipped?: 'off' | 'tenant-mode';
    warned?: number;
    deleted?: number;
    reported?: number;
    unwarned?: number;
  };
}> = {
  slug: 'clean-up-idle-workspaces',
  label: 'Warn and delete idle workspaces',
  // Scheduled by the host only, in `payload.config.ts`
  handler: async ({ req }) => {
    if (getEnv().APP_MODE.type !== 'host') {
      return { output: { skipped: 'tenant-mode' as const } };
    }

    const output = await sweepIdleWorkspaces(req.payload, new Date());

    if ('warned' in output && (output.warned || output.deleted)) {
      req.payload.logger.info(
        `[cleanUpIdleWorkspaces] Warned ${output.warned}, deleted ${output.deleted}, reported ${output.reported}, unwarned ${output.unwarned}`
      );
    }

    return { output };
  }
};
