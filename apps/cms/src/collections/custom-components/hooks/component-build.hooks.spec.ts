import type { CustomComponent } from '@codeware/shared/util/payload-types';
import type { PayloadRequest } from 'payload';

import {
  BUILD_CUSTOM_COMPONENT_TASK,
  COMPONENT_BUILD_CONTEXT,
  COMPONENT_BUILD_QUEUE
} from '../../../jobs/build-custom-component.task';

import { markBuildPending, queueComponentBuild } from './component-build.hooks';

jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: jest.fn()
}));

const original = {
  id: 3,
  slug: 'counter',
  source: 'a',
  build: { status: 'ready', js: 'js', css: 'css', hash: 'h' }
} as unknown as CustomComponent;

const callBefore = (
  args: Partial<Parameters<typeof markBuildPending>[0]>
): unknown =>
  markBuildPending({
    data: {},
    operation: 'update',
    originalDoc: original,
    context: {},
    ...args
  } as Parameters<typeof markBuildPending>[0]);

describe('markBuildPending', () => {
  it('marks a created component pending', () => {
    expect(
      callBefore({ operation: 'create', originalDoc: undefined, data: {} })
    ).toMatchObject({ build: { status: 'pending' } });
  });

  it.each([{ source: 'b' }, { slug: 'other' }])(
    'marks a changed %o pending and keeps the bundle',
    (data) => {
      expect(callBefore({ data })).toMatchObject({
        ...data,
        build: { status: 'pending', js: 'js', css: 'css', hash: 'h' }
      });
    }
  );

  it('leaves an unchanged source and slug alone', () => {
    const data = { source: 'a', slug: 'counter', name: 'New name' };
    expect(callBefore({ data })).toBe(data);
  });

  it('leaves the build task’s own writes alone', () => {
    const data = { source: 'b' };
    expect(
      callBefore({ data, context: { [COMPONENT_BUILD_CONTEXT]: true } })
    ).toBe(data);
  });
});

describe('queueComponentBuild', () => {
  const setup = (transactionID?: string) => {
    const queue = jest.fn().mockResolvedValue({ id: 'job-1' });
    const runByID = jest.fn().mockResolvedValue({});
    const logger = { error: jest.fn() };
    const req = {
      transactionID,
      payload: { jobs: { queue, runByID }, logger }
    } as unknown as PayloadRequest;
    const call = (
      status: string,
      context: Record<string, unknown> = {}
    ): unknown =>
      queueComponentBuild({
        doc: { ...original, build: { status } },
        context,
        req
      } as unknown as Parameters<typeof queueComponentBuild>[0]);
    return { queue, runByID, logger, req, call };
  };

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('queues the task on its own queue and runs that job', async () => {
    const { queue, runByID, call } = setup();

    call('pending');
    await settle();
    await settle();

    expect(queue).toHaveBeenCalledWith({
      task: BUILD_CUSTOM_COMPONENT_TASK,
      input: { id: 3 },
      queue: COMPONENT_BUILD_QUEUE
    });
    expect(runByID).toHaveBeenCalledWith({ id: 'job-1' });
  });

  it('returns without waiting for the build', () => {
    const { runByID, call } = setup();
    runByID.mockReturnValue(new Promise(() => undefined));

    expect(call('pending')).toMatchObject({ id: 3 });
  });

  it('queues but does not start a seeded component', async () => {
    const { queue, runByID, call } = setup();

    call('pending', { seedAction: true });
    await settle();

    expect(queue).toHaveBeenCalled();
    expect(runByID).not.toHaveBeenCalled();
  });

  it.each(['ready', 'failed', 'building'])(
    'does nothing for a %s component',
    async (status) => {
      const { queue, call } = setup();

      call(status);
      await settle();

      expect(queue).not.toHaveBeenCalled();
    }
  );

  it('does nothing for the build task’s own writes', async () => {
    const { queue, call } = setup();

    call('pending', { [COMPONENT_BUILD_CONTEXT]: true });
    await settle();

    expect(queue).not.toHaveBeenCalled();
  });

  it('logs a queueing failure instead of throwing', async () => {
    const { queue, logger, call } = setup();
    queue.mockRejectedValue(new Error('db down'));

    expect(() => call('pending')).not.toThrow();
    await settle();

    expect(logger.error).toHaveBeenCalled();
  });
});
