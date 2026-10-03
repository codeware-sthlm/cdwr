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

  it('clears the bundle when the slug changes, since it defines the old tag', () => {
    expect(callBefore({ data: { slug: 'other' } })).toMatchObject({
      slug: 'other',
      build: { status: 'pending', js: null, css: null, hash: null }
    });
  });

  it('keeps the bundle for a created component with its own slug', () => {
    expect(
      callBefore({
        operation: 'create',
        originalDoc: undefined,
        data: { slug: 'x' }
      })
    ).toMatchObject({ build: { status: 'pending' } });
  });

  it.each([{ source: 'b' }])(
    'marks a changed %o pending and keeps the bundle',
    (data) => {
      expect(callBefore({ data })).toMatchObject({
        ...data,
        build: { status: 'pending', js: 'js', css: 'css', hash: 'h' }
      });
    }
  );

  const declared: NonNullable<CustomComponent['propsSchema']> = [
    { name: 'label', type: 'text', required: true }
  ];
  const withSchema = {
    ...original,
    propsSchema: declared
  } as unknown as CustomComponent;

  it.each<[Pick<CustomComponent, 'propsSchema'>]>([
    [{ propsSchema: [] }],
    [{ propsSchema: [{ name: 'label', type: 'text', required: false }] }],
    [{ propsSchema: [{ name: 'label', type: 'number', required: true }] }],
    [{ propsSchema: [{ name: 'other', type: 'text', required: true }] }]
  ])('marks changed declared props %o pending', (data) => {
    expect(callBefore({ data, originalDoc: withSchema })).toMatchObject({
      build: { status: 'pending', js: 'js' }
    });
  });

  it('keeps the bundle when only the inputs change', () => {
    expect(
      callBefore({ data: { propsSchema: [] }, originalDoc: withSchema })
    ).toMatchObject({ build: { js: 'js', css: 'css', hash: 'h' } });
  });

  it('marks the first declared prop pending', () => {
    expect(callBefore({ data: { propsSchema: declared } })).toMatchObject({
      build: { status: 'pending' }
    });
  });

  it('ignores row ids, labels and a missing required flag', () => {
    const data: Pick<CustomComponent, 'propsSchema'> = {
      propsSchema: [
        { id: 'x', name: 'label', label: 'Label', type: 'text', required: true }
      ]
    };
    expect(callBefore({ data, originalDoc: withSchema })).toBe(data);
    const loose: Pick<CustomComponent, 'propsSchema'> = {
      propsSchema: [{ name: 'label', type: 'text', required: null }]
    };
    expect(
      callBefore({
        data: loose,
        originalDoc: {
          ...withSchema,
          propsSchema: [{ name: 'label', type: 'text' }]
        } as unknown as CustomComponent
      })
    ).toBe(loose);
  });

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

  it.each(['ready', 'failed'])(
    'does nothing for a %s component',
    async (status) => {
      const { queue, call } = setup();

      call(status);
      await settle();

      expect(queue).not.toHaveBeenCalled();
    }
  );

  it('queues again for a component left in building', async () => {
    const { queue, call } = setup();

    call('building');
    await settle();

    expect(queue).toHaveBeenCalledTimes(1);
  });

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
