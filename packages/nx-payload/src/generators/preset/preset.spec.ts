// Prevent @nx/next:init and @cdwr/nx-payload:init from calling createProjectGraphAsync,
// which hits the real filesystem even when given a virtual Tree.
jest.mock('@nx/devkit', () => ({
  ...jest.requireActual('@nx/devkit'),
  createProjectGraphAsync: jest.fn().mockResolvedValue({
    nodes: {},
    dependencies: {}
  })
}));

import { type Tree, readProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';

import { payloadTargets } from '../../utils/definitions';

import { presetGenerator } from './preset';
import type { PresetGeneratorSchema } from './schema';

describe('preset generator', () => {
  let tree: Tree;

  const options: PresetGeneratorSchema = {
    name: 'test',
    payloadAppName: 'test-app',
    payloadAppDirectory: 'app-dir/test-app',
    addPlugin: true,
    skipFormat: true
  };

  console.log = jest.fn();
  console.warn = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    tree = createTreeWithEmptyWorkspace({
      layout: 'apps-libs',
      // Prettier, as before Nx 23.3: an oxfmt tree installs oxfmt out of
      // band, and Jest cannot load it
      formatter: 'prettier'
    });
  });

  it('should generate project config without payload targets', async () => {
    await presetGenerator(tree, options);

    const { targets, ...config } = readProjectConfiguration(tree, 'test-app');

    for (const target of payloadTargets) {
      expect(targets[target]).toBeUndefined();
    }

    expect(config).toMatchSnapshot();
  });

  it('should use workspace `name` when `appName` is not provided', async () => {
    await presetGenerator(tree, {
      ...options,
      name: 'workspace-name',
      payloadAppName: '',
      payloadAppDirectory: ''
    });

    const { name } = readProjectConfiguration(tree, 'workspace-name');
    expect(name).toBe('workspace-name');
  });

  it('should set "apps" as the default app base path', async () => {
    await presetGenerator(tree, {
      ...options,
      name: 'test',
      payloadAppName: 'test-app',
      payloadAppDirectory: ''
    });

    const { name, sourceRoot } = readProjectConfiguration(tree, 'test-app');
    expect(name).toBe('test-app');
    expect(sourceRoot).toBe('apps/test-app/src');
  });

  it('should delete "libs" folder', async () => {
    await presetGenerator(tree, options);

    expect(tree.children('').includes('apps')).toBeTruthy();
    expect(tree.children('').includes('libs')).toBeFalsy();
  });
});
