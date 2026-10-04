import type { ComponentBuildDeps } from './run-component-build';
import { runComponentBuild } from './run-component-build';

const toolchain = {
  ok: true,
  toolchain: { root: '/ws', kit: '/ws/kit.ts', themeCss: '/ws/theme.css' }
} as const;

const built = {
  ok: true,
  js: 'js',
  css: 'css',
  hash: '0123456789abcdef',
  diagnostics: []
} as const;

const depsWith = (
  buildComponent: ComponentBuildDeps['buildComponent'],
  resolve: ComponentBuildDeps['resolveToolchain'] = () => toolchain
): ComponentBuildDeps => ({ resolveToolchain: resolve, buildComponent });

describe('runComponentBuild', () => {
  it('builds in the resolved workspace against the kit', async () => {
    const build = vi.fn().mockResolvedValue(built);

    const result = await runComponentBuild(
      { tagName: 'cdwr-x-counter', source: 'src' },
      { root: '/ws' },
      depsWith(build)
    );

    expect(result).toEqual(built);
    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({
        tagName: 'cdwr-x-counter',
        source: 'src',
        workspaceRoot: '/ws',
        themeCss: '/ws/theme.css',
        hostModules: expect.objectContaining({
          '@site/ui': { typesEntry: '/ws/kit.ts' }
        })
      })
    );
  });

  it('passes the location on to the resolver', async () => {
    const resolve = vi.fn().mockReturnValue(toolchain);

    await runComponentBuild(
      { tagName: 't', source: 's' },
      { root: '/ws', cwd: '/ws/apps/x' },
      depsWith(vi.fn().mockResolvedValue(built), resolve)
    );

    expect(resolve).toHaveBeenCalledWith({ root: '/ws', cwd: '/ws/apps/x' });
  });

  it('adds the findings of the props comparison', async () => {
    const build = vi.fn().mockResolvedValue({
      ...built,
      props: [{ name: 'label', kind: 'string', optional: false }]
    });

    const result = await runComponentBuild(
      { tagName: 't', source: 's', propsSchema: [] },
      {},
      depsWith(build)
    );

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('`label`')
      })
    ]);
  });

  it('reports a declared prop type the code does not take as an error', async () => {
    const build = vi.fn().mockResolvedValue({
      ...built,
      props: [{ name: 'label', kind: 'string', optional: true }]
    });

    const result = await runComponentBuild(
      {
        tagName: 't',
        source: 's',
        propsSchema: [{ name: 'label', type: 'number' }]
      },
      {},
      depsWith(build)
    );

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('declared as `number`')
      })
    ]);
  });

  it('skips the comparison without a schema', async () => {
    const build = vi.fn().mockResolvedValue({
      ...built,
      props: [{ name: 'label', kind: 'string', optional: false }]
    });

    const result = await runComponentBuild(
      { tagName: 't', source: 's' },
      {},
      depsWith(build)
    );

    expect(result.diagnostics).toEqual([]);
  });

  it('leaves a failed build as it is', async () => {
    const failed = {
      ok: false,
      diagnostics: [{ message: 'no', line: 1, column: 1, severity: 'error' }]
    };

    await expect(
      runComponentBuild(
        { tagName: 't', source: 's', propsSchema: [] },
        {},
        depsWith(vi.fn().mockResolvedValue(failed))
      )
    ).resolves.toEqual(failed);
  });

  it('fails with one clear diagnostic when the toolchain is missing', async () => {
    const build = vi.fn();

    const result = await runComponentBuild(
      { tagName: 't', source: 's' },
      {},
      depsWith(build, () => ({ ok: false, reason: 'No workspace root' }))
    );

    expect(build).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.message).toContain(
      'The component build toolchain is not available in this environment'
    );
    expect(result.diagnostics[0]?.transient).toBe(true);
  });
});
