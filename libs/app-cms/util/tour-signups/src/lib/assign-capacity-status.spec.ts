import type { TourSignup } from '@codeware/shared/util/payload-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assignCapacityStatus } from './assign-capacity-status';
import * as capacity from './capacity';

vi.mock('./capacity', () => ({
  lockTour: vi.fn(async () => undefined),
  nextQueuePosition: vi.fn(async () => 1),
  sumBookedPeople: vi.fn(),
  sumWaitingPeople: vi.fn()
}));

type HookArgs = Parameters<typeof assignCapacityStatus>[0];

const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('assignCapacityStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sums waiting people only after the booked sum resolves', async () => {
    // Both sums share the transaction's single pg client, so they must run
    // one after the other
    const booked = deferred<number>();
    vi.mocked(capacity.sumBookedPeople).mockReturnValue(booked.promise);
    vi.mocked(capacity.sumWaitingPeople).mockResolvedValue(0);

    const running = assignCapacityStatus({
      data: { tour: 10, people: 1 } as Partial<TourSignup>,
      operation: 'create',
      req: {
        payload: {
          findByID: vi.fn().mockResolvedValue({ id: 10, maxCustomers: 5 })
        },
        t: (key: string) => key
      }
    } as unknown as HookArgs);

    await flush();
    expect(capacity.sumBookedPeople).toHaveBeenCalledTimes(1);
    expect(capacity.sumWaitingPeople).not.toHaveBeenCalled();

    booked.resolve(0);
    await flush();
    expect(capacity.sumWaitingPeople).toHaveBeenCalledTimes(1);

    await expect(running).resolves.toMatchObject({ status: 'booked' });
  });
});
