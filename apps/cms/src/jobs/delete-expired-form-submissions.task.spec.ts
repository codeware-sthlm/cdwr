import {
  deleteFormSubmissions,
  getSiteSettingsForAllTenants
} from '@codeware/app-cms/data-access';
import type { BasePayload } from 'payload';

import { sweepExpiredSubmissions } from './delete-expired-form-submissions.task';

jest.mock('@codeware/app-cms/data-access', () => ({
  deleteFormSubmissions: jest.fn(),
  getSiteSettingsForAllTenants: jest.fn()
}));

const NOW = new Date('2026-09-15T03:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const getSettings = jest.mocked(getSiteSettingsForAllTenants);
const remove = jest.mocked(deleteFormSubmissions);
const logger = { error: jest.fn() };
const payload = { logger } as unknown as BasePayload;

const settings = (docs: Array<Record<string, unknown>>) =>
  getSettings.mockResolvedValue(docs as never);

const deletedDocs = (ids: Array<number>, errors: Array<unknown> = []) =>
  ({ docs: ids.map((id) => ({ id })), errors }) as never;

describe('sweepExpiredSubmissions', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    jest.clearAllMocks();
    remove.mockResolvedValue(deletedDocs([]));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("deletes a workspace's submissions older than its retention period", async () => {
    settings([{ tenant: 7, forms: { retentionDays: 30 } }]);
    remove.mockResolvedValue(deletedDocs([1, 2]));

    expect(await sweepExpiredSubmissions(payload)).toBe(2);
    expect(remove).toHaveBeenCalledWith(payload, {
      and: [
        { tenant: { equals: 7 } },
        {
          createdAt: {
            less_than: new Date(NOW.getTime() - 30 * DAY).toISOString()
          }
        }
      ]
    });
  });

  it('leaves a workspace without a retention period alone', async () => {
    settings([
      { tenant: 7, forms: {} },
      { tenant: 8, forms: { retentionDays: null } },
      { tenant: 9 }
    ]);

    expect(await sweepExpiredSubmissions(payload)).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });

  it('reads a populated tenant and sums across workspaces', async () => {
    settings([
      { tenant: { id: 7 }, forms: { retentionDays: 30 } },
      { tenant: 8, forms: { retentionDays: 90 } }
    ]);
    remove
      .mockResolvedValueOnce(deletedDocs([1]))
      .mockResolvedValueOnce(deletedDocs([2, 3]));

    expect(await sweepExpiredSubmissions(payload)).toBe(3);
    expect(remove.mock.calls[0][1]).toMatchObject({
      and: [{ tenant: { equals: 7 } }, expect.anything()]
    });
  });

  it('logs submissions that could not be deleted', async () => {
    settings([{ tenant: 7, forms: { retentionDays: 30 } }]);
    remove.mockResolvedValue(deletedDocs([1], [{ id: 2, message: 'nope' }]));

    expect(await sweepExpiredSubmissions(payload)).toBe(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
