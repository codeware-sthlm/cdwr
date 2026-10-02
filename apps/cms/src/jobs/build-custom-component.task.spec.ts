import type { BasePayload } from 'payload';

import {
  type BuildDeps,
  COMPONENT_BUILD_CONTEXT,
  buildCustomComponent
} from './build-custom-component.task';

jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: jest.fn()
}));

type Doc = {
  propsSchema?: unknown[];
  id: number;
  slug: string;
  source: string;
  build: Record<string, unknown>;
};

const doc = (overrides: Partial<Doc> = {}): Doc => ({
  id: 5,
  slug: 'counter',
  source: 'export default () => null',
  build: {
    status: 'pending',
    js: 'old-js',
    css: 'old-css',
    hash: 'oldhash',
    diagnostics: []
  },
  ...overrides
});

const setup = (docs: Array<Doc | null>) => {
  const findByID = jest.fn();
  for (const d of docs) {
    findByID.mockResolvedValueOnce(d);
  }
  findByID.mockResolvedValue(docs[docs.length - 1]);
  const update = jest.fn().mockResolvedValue({});
  const logger = { error: jest.fn() };
  const payload = { findByID, update, logger } as unknown as BasePayload;
  return { payload, update, logger };
};

const depsWith = (buildLocally: jest.Mock): BuildDeps => ({
  buildLocally,
  service: () => undefined,
  fetch: jest.fn()
});

const writes = (update: jest.Mock) =>
  update.mock.calls.map(([args]) => args.data.build);

describe('buildCustomComponent', () => {
  it('records a ready bundle and marks the build as running first', async () => {
    const { payload, update } = setup([doc()]);
    const build = jest.fn().mockResolvedValue({
      ok: true,
      js: 'js',
      css: 'css',
      hash: 'h',
      diagnostics: []
    });

    await expect(
      buildCustomComponent(payload, 5, depsWith(build))
    ).resolves.toBe('ready');

    expect(build).toHaveBeenCalledWith({
      tagName: 'cdwr-x-counter',
      source: 'export default () => null',
      propsSchema: []
    });
    const [building, ready] = writes(update);
    expect(building).toMatchObject({ status: 'building', js: 'old-js' });
    expect(ready).toMatchObject({
      status: 'ready',
      js: 'js',
      css: 'css',
      hash: 'h',
      diagnostics: []
    });
    expect(ready.builtAt).toEqual(expect.any(String));
  });

  it('stores the warnings of a ready build', async () => {
    const { payload, update } = setup([doc({ propsSchema: [] })]);
    const warnings = [
      { message: 'unused', line: 3, column: 2, severity: 'warning' },
      { message: 'undeclared', line: 0, column: 0, severity: 'warning' }
    ];
    const build = jest.fn().mockResolvedValue({
      ok: true,
      js: 'js',
      css: 'css',
      hash: 'h',
      diagnostics: warnings
    });

    await expect(
      buildCustomComponent(payload, 5, depsWith(build))
    ).resolves.toBe('ready');

    const ready = writes(update).at(-1);
    expect(ready.status).toBe('ready');
    expect(ready.diagnostics).toEqual(warnings);
  });

  it('fails a build that compiled but carries an error finding', async () => {
    const { payload, update } = setup([doc()]);
    const error = {
      message: 'declared as `number`',
      line: 0,
      column: 0,
      severity: 'error'
    };
    const build = jest.fn().mockResolvedValue({
      ok: true,
      js: 'js',
      css: 'css',
      hash: 'h',
      diagnostics: [error]
    });

    await expect(
      buildCustomComponent(payload, 5, depsWith(build))
    ).resolves.toBe('failed');

    const failed = writes(update).at(-1);
    expect(failed.status).toBe('failed');
    expect(failed.diagnostics).toEqual([error]);
    // The bundle that was built is discarded; the previous one stays
    expect(failed.js).toBe('old-js');
    expect(failed.hash).toBe('oldhash');
  });

  it('keeps the previous bundle when the build fails', async () => {
    const { payload, update } = setup([doc()]);
    const diagnostics = [
      { message: 'nope', line: 2, column: 1, severity: 'error' }
    ];
    const build = jest.fn().mockResolvedValue({ ok: false, diagnostics });

    await expect(
      buildCustomComponent(payload, 5, depsWith(build))
    ).resolves.toBe('failed');

    expect(writes(update).at(-1)).toMatchObject({
      status: 'failed',
      diagnostics,
      js: 'old-js',
      css: 'old-css',
      hash: 'oldhash'
    });
  });

  it('ends in failed when the builder throws', async () => {
    const { payload, update, logger } = setup([doc()]);
    const build = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(
      buildCustomComponent(payload, 5, depsWith(build))
    ).resolves.toBe('failed');

    expect(logger.error).toHaveBeenCalled();
    expect(writes(update).at(-1)).toMatchObject({
      status: 'failed',
      diagnostics: [
        expect.objectContaining({ message: expect.stringContaining('boom') })
      ]
    });
  });

  it('ends in failed when the builder cannot even be loaded', async () => {
    const { payload, update } = setup([doc()]);

    await expect(
      buildCustomComponent(
        payload,
        5,
        depsWith(jest.fn().mockRejectedValue(new Error('no esbuild')))
      )
    ).resolves.toBe('failed');

    expect(writes(update).at(-1)).toMatchObject({ status: 'failed' });
  });

  it('flags every write so none queues another build', async () => {
    const { payload, update } = setup([doc()]);
    const build = jest.fn().mockResolvedValue({
      ok: true,
      js: 'js',
      css: 'css',
      hash: 'h',
      diagnostics: []
    });

    await buildCustomComponent(payload, 5, depsWith(build));

    expect(update).toHaveBeenCalledTimes(2);
    for (const [args] of update.mock.calls) {
      expect(args.context).toEqual({ [COMPONENT_BUILD_CONTEXT]: true });
      expect(args.overrideAccess).toBe(true);
    }
  });

  it('writes nothing when the source changed during the build', async () => {
    const { payload, update } = setup([
      doc(),
      doc({ source: 'edited meanwhile' })
    ]);
    const build = jest.fn().mockResolvedValue({
      ok: true,
      js: 'js',
      css: 'css',
      hash: 'h',
      diagnostics: []
    });

    await expect(
      buildCustomComponent(payload, 5, depsWith(build))
    ).resolves.toBe('skipped');

    // Only the `building` marker
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when the inputs changed during the build', async () => {
    const { payload, update } = setup([
      doc({ propsSchema: [{ name: 'a', type: 'text', required: false }] }),
      doc({ propsSchema: [{ name: 'a', type: 'number', required: false }] })
    ]);
    const build = jest.fn().mockResolvedValue({
      ok: true,
      js: 'js',
      css: 'css',
      hash: 'h',
      diagnostics: []
    });

    await expect(
      buildCustomComponent(payload, 5, depsWith(build))
    ).resolves.toBe('skipped');

    expect(update).toHaveBeenCalledTimes(1);
  });

  it.each(['ready', 'failed'])(
    'skips a component already %s',
    async (status) => {
      const { payload, update } = setup([doc({ build: { status } })]);
      const build = jest.fn();

      await expect(
        buildCustomComponent(payload, 5, depsWith(build))
      ).resolves.toBe('skipped');
      expect(build).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    }
  );

  it('skips a component that no longer exists', async () => {
    const { payload, update } = setup([null]);

    await expect(
      buildCustomComponent(payload, 5, depsWith(jest.fn()))
    ).resolves.toBe('skipped');
    expect(update).not.toHaveBeenCalled();
  });

  it('rebuilds a component a restart left in building', async () => {
    const { payload } = setup([doc({ build: { status: 'building' } })]);
    const build = jest.fn().mockResolvedValue({
      ok: true,
      js: 'js',
      css: 'css',
      hash: 'h',
      diagnostics: []
    });

    await expect(
      buildCustomComponent(payload, 5, depsWith(build))
    ).resolves.toBe('ready');
  });
});
