import { getEnv } from '@codeware/app-cms/feature/env-loader';
import {
  renderIdleWorkspaceSummaryMail,
  sendPlatformMail
} from '@codeware/app-cms/util/email';
import type { BasePayload } from 'payload';

import { workspaceHasPages } from '../security/first-site-tenant';

import {
  cleanUpIdleWorkspacesTask,
  sweepIdleWorkspaces
} from './clean-up-idle-workspaces.task';

jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: jest.fn(() => ({ APP_MODE: { type: 'host' } }))
}));

jest.mock('@codeware/app-cms/util/email', () => ({
  PLATFORM_EMAIL_BRAND: { name: 'Codeware CMS' },
  renderIdleWorkspaceSummaryMail: jest.fn(() => ({ subject: 'summary' })),
  renderIdleWorkspaceWarningMail: jest.fn(() => ({ subject: 'warning' })),
  sendPlatformMail: jest.fn()
}));

jest.mock('../security/first-site-tenant', () => ({
  workspaceHasPages: jest.fn()
}));

const NOW = new Date('2026-09-15T03:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) =>
  new Date(NOW.getTime() - days * DAY).toISOString();

const hasPages = jest.mocked(workspaceHasPages);
const send = jest.mocked(sendPlatformMail);
const renderSummary = jest.mocked(renderIdleWorkspaceSummaryMail);

const find = jest.fn();
const update = jest.fn();
const remove = jest.fn();
const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
const payload = {
  find,
  update,
  delete: remove,
  logger,
  config: { serverURL: 'https://cms.example.com', routes: { admin: '/admin' } }
} as unknown as BasePayload;

let settings: Record<string, unknown>;
let tenants: Array<Record<string, unknown>>;
let users: Array<Record<string, unknown>>;

const tenant = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  name: `Workspace ${id}`,
  status: 'pending',
  supportedLocales: ['sv'],
  createdAt: ago(60),
  ...over
});

const admin = (
  id: number,
  tenantIds: Array<number>,
  over: Record<string, unknown> = {}
) => ({
  id,
  email: `user${id}@example.com`,
  role: 'user',
  _verified: true,
  tenants: tenantIds.map((t) => ({ tenant: t, role: 'admin' })),
  ...over
});

describe('sweepIdleWorkspaces', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    settings = {
      idleWorkspaceDays: 30,
      signupNotifyEmail: 'owner@example.com'
    };
    tenants = [];
    users = [];
    hasPages.mockResolvedValue(false);
    send.mockResolvedValue(true);
    find.mockImplementation(async ({ collection }) => ({
      docs:
        collection === 'platform-settings'
          ? [settings]
          : collection === 'tenants'
            ? tenants
            : users
    }));
  });

  it('does nothing when no idle period is set', async () => {
    settings = { idleWorkspaceDays: null };

    expect(await sweepIdleWorkspaces(payload, NOW)).toEqual({ skipped: 'off' });
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('warns the verified admins and starts the clock', async () => {
    tenants = [tenant(1)];
    users = [admin(10, [1]), admin(11, [1], { _verified: false })];

    const result = await sweepIdleWorkspaces(payload, NOW);

    expect(result).toEqual({
      warned: 1,
      deleted: 0,
      reported: 0,
      unwarned: 0
    });
    expect(send).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ to: 'user10@example.com' })
    );
    expect(send).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ to: 'owner@example.com' })
    );
    expect(send).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'tenants',
        id: 1,
        data: { idleWarnedAt: NOW.toISOString() },
        context: { idleCleanup: true }
      })
    );
  });

  it('does not start the clock with no admin to warn', async () => {
    tenants = [tenant(1)];

    const result = await sweepIdleWorkspaces(payload, NOW);

    expect(result).toEqual({
      warned: 0,
      deleted: 0,
      reported: 0,
      unwarned: 1
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(renderSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        unwarned: [{ name: 'Workspace 1', reason: 'no-admin' }]
      })
    );
  });

  it('does not start the clock when the warning mail fails', async () => {
    tenants = [tenant(1)];
    users = [admin(10, [1])];
    send.mockResolvedValueOnce(false);

    const result = await sweepIdleWorkspaces(payload, NOW);

    expect(result).toEqual({
      warned: 0,
      deleted: 0,
      reported: 0,
      unwarned: 1
    });
    expect(update).not.toHaveBeenCalled();
    expect(renderSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        unwarned: [{ name: 'Workspace 1', reason: 'mail-failed' }]
      })
    );
  });

  it('deletes the workspace and the users with nothing else', async () => {
    tenants = [tenant(1, { createdAt: ago(40), idleWarnedAt: ago(10) })];
    users = [admin(10, [1]), admin(11, [1, 2])];

    const result = await sweepIdleWorkspaces(payload, NOW);

    expect(result).toEqual({
      warned: 0,
      deleted: 1,
      reported: 0,
      unwarned: 0
    });
    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'tenants',
        id: 1,
        context: { idleCleanup: true }
      })
    );
    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'users', id: 10 })
    );
    expect(remove).not.toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'users', id: 11 })
    );
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('reports a provisioned workspace to the summary only', async () => {
    tenants = [tenant(1, { statsTeamId: 'team' })];

    const result = await sweepIdleWorkspaces(payload, NOW);

    expect(result).toEqual({
      warned: 0,
      deleted: 0,
      reported: 1,
      unwarned: 0
    });
    expect(remove).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        data: { idleWarnedAt: NOW.toISOString() }
      })
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reports a provisioned workspace once', async () => {
    tenants = [tenant(1, { statsTeamId: 'team', idleWarnedAt: ago(1) })];

    const result = await sweepIdleWorkspaces(payload, NOW);

    expect(result).toEqual({
      warned: 0,
      deleted: 0,
      reported: 0,
      unwarned: 0
    });
    expect(update).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('clears the warning once the workspace has a page', async () => {
    tenants = [tenant(1, { idleWarnedAt: ago(3) })];
    hasPages.mockResolvedValue(true);

    const result = await sweepIdleWorkspaces(payload, NOW);

    expect(result).toEqual({
      warned: 0,
      deleted: 0,
      reported: 0,
      unwarned: 0
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, data: { idleWarnedAt: null } })
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('sends no summary when nothing happened', async () => {
    tenants = [tenant(1, { createdAt: ago(5) })];

    await sweepIdleWorkspaces(payload, NOW);

    expect(send).not.toHaveBeenCalled();
  });

  it('is skipped by the task outside host mode', async () => {
    jest
      .mocked(getEnv)
      .mockReturnValueOnce({ APP_MODE: { type: 'tenant' } } as ReturnType<
        typeof getEnv
      >);

    const handler = cleanUpIdleWorkspacesTask.handler as (args: {
      req: { payload: BasePayload };
    }) => Promise<unknown>;

    expect(await handler({ req: { payload } })).toEqual({
      output: { skipped: 'tenant-mode' }
    });
    expect(find).not.toHaveBeenCalled();
  });

  it('carries on when one workspace fails', async () => {
    tenants = [
      tenant(1, { createdAt: ago(40), idleWarnedAt: ago(10) }),
      tenant(2, { createdAt: ago(40), idleWarnedAt: ago(10) })
    ];
    users = [];
    remove.mockRejectedValueOnce(new Error('boom'));

    const result = await sweepIdleWorkspaces(payload, NOW);

    expect(result).toEqual({
      warned: 0,
      deleted: 1,
      reported: 0,
      unwarned: 0
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
