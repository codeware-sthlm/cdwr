// Prevent @nx/next:init and @cdwr/nx-payload:init from calling createProjectGraphAsync,
// which hits the real filesystem even when given a virtual Tree.
jest.mock('@nx/devkit', () => ({
  ...jest.requireActual('@nx/devkit'),
  createProjectGraphAsync: jest.fn().mockResolvedValue({
    nodes: {},
    dependencies: {}
  })
}));

import { type Tree, readNxJson, readProjectConfiguration } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { lintConfigHasOverride } from '@nx/eslint/internal';

import { payloadTargets } from '../../utils/definitions';

import { applicationGenerator } from './application';
import type { AppGeneratorSchema } from './schema';

describe('application generator', () => {
  let tree: Tree;
  const options: AppGeneratorSchema = {
    directory: 'apps/test-dir',
    name: 'test-app',
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

  afterEach(() => {
    process.removeAllListeners('SIGTERM');
  });

  it('should put the source root in the src folder', async () => {
    await applicationGenerator(tree, options);

    const { root, sourceRoot } = readProjectConfiguration(tree, options.name);
    expect(root).toEqual(options.directory);
    expect(sourceRoot).toEqual(`${options.directory}/src`);
  });

  it('should generate payload files in src folder', async () => {
    await applicationGenerator(tree, options);

    expect(tree.exists(`${options.directory}/src`)).toBeTruthy();
  });

  it('should generate application files in app folder', async () => {
    await applicationGenerator(tree, options);

    expect(tree.exists(`${options.directory}/src/app`)).toBeTruthy();
  });

  it('should generate one test file', async () => {
    await applicationGenerator(tree, options);

    expect(tree.children(`${options.directory}/specs`).length).toBe(1);
  });

  it('should verify generated project base files', async () => {
    await applicationGenerator(tree, options);

    const rootDir = options.directory;
    const srcDir = `${rootDir}/src`;

    expect(tree.exists(`${rootDir}/eslint.config.mjs`)).toBeTruthy();

    expect(tree.exists(`${rootDir}/tsconfig.json`)).toBeTruthy();
    expect(tree.exists(`${rootDir}/tsconfig.spec.json`)).toBeTruthy();

    expect(tree.exists(`${srcDir}/payload.config.ts`)).toBeTruthy();
    expect(tree.exists(`${srcDir}/generated/.gitkeep`)).toBeTruthy();
    expect(tree.exists(`${srcDir}/migrations/.gitkeep`)).toBeTruthy();
  });

  it('should generate docker files', async () => {
    await applicationGenerator(tree, options);
    const rootDir = options.directory;

    expect(tree.exists(`${rootDir}/docker-compose.yml`)).toBeTruthy();
    expect(tree.exists(`${rootDir}/Dockerfile`)).toBeTruthy();
    expect(tree.exists(`${rootDir}/Dockerfile.dockerignore`)).toBeTruthy();

    expect(tree.read(`${rootDir}/Dockerfile`, 'utf-8')).toMatchSnapshot();
  });

  it('should not generate e2e application by default', async () => {
    await applicationGenerator(tree, options);

    expect(tree.exists(`${options.directory}-e2e/project.json`)).toBeFalsy();
  });

  it('should generate e2e application', async () => {
    await applicationGenerator(tree, {
      ...options,
      e2eTestRunner: 'playwright'
    });

    expect(tree.exists(`${options.directory}-e2e/project.json`)).toBeTruthy();
  });

  it('should add docker and local env files', async () => {
    await applicationGenerator(tree, options);

    const envFiles = tree
      .children(options.directory)
      .filter((file) => file.match(/\.env/));

    expect(envFiles).toEqual(['.env.docker', '.env.local']);
  });

  it('should setup mongodb in payload config by default', async () => {
    await applicationGenerator(tree, options);

    const content = tree.read(
      `${options.directory}/src/payload.config.ts`,
      'utf-8'
    );
    expect(content.match(/mongooseAdapter/g)).toBeDefined();
  });

  it('should generate payload config with mongodb adapter', async () => {
    await applicationGenerator(tree, { ...options, database: 'mongodb' });

    const content = tree.read(
      `${options.directory}/src/payload.config.ts`,
      'utf-8'
    );
    expect(content).toMatchSnapshot();
  });

  it('should generate payload config with postgres adapter', async () => {
    await applicationGenerator(tree, { ...options, database: 'postgres' });

    const content = tree.read(
      `${options.directory}/src/payload.config.ts`,
      'utf-8'
    );
    expect(content).toMatchSnapshot();
  });

  it('should add next and payload plugins to nx.json', async () => {
    await applicationGenerator(tree, options);

    const nxJson = readNxJson(tree);
    const plugins = nxJson.plugins.map(
      (p) => typeof p === 'object' && p.plugin
    );

    expect(plugins.includes('@cdwr/nx-payload/plugin')).toBeTruthy();
    expect(plugins.includes('@nx/next/plugin')).toBeTruthy();
  });

  it('should add payload plugin with all options', async () => {
    await applicationGenerator(tree, options);

    const nxJson = readNxJson(tree);
    expect(
      nxJson.plugins.find(
        (p) => typeof p === 'object' && p.plugin === '@cdwr/nx-payload/plugin'
      )
    ).toEqual({
      plugin: '@cdwr/nx-payload/plugin',
      options: {
        dxMongodbTargetName: 'dx:mongodb',
        dxPostgresTargetName: 'dx:postgres',
        dxStartTargetName: 'dx:start',
        dxStopTargetName: 'dx:stop',
        generateTargetName: 'gen',
        payloadGraphqlTargetName: 'payload-graphql',
        payloadTargetName: 'payload'
      }
    });
  });

  it('should add project eslint overrides for payload app files', async () => {
    await applicationGenerator(tree, options);

    expect(
      lintConfigHasOverride(
        tree,
        options.directory,
        (override) =>
          override.rules['@nx/enforce-module-boundaries'] === 'off' &&
          override.files.includes('src/app/(payload)/**/*')
      )
    ).toBe(true);
  });

  it('should build standalone next.js app', async () => {
    await applicationGenerator(tree, options);

    const nextConfig = tree
      .read(`${options.directory}/next.config.mjs`, 'utf-8')
      .replaceAll(/(\s|\n)/g, '');
    expect(nextConfig).toContain(`output:'standalone'`);
    expect(nextConfig).toContain(
      `outputFileTracingRoot:path.join(__dirname,'../../')`
    );
  });

  it('should declare @payloadcms/next/css module in index.d.ts', async () => {
    await applicationGenerator(tree, options);

    const declarations = tree.read(`${options.directory}/index.d.ts`, 'utf-8');
    expect(declarations).toContain("declare module '@payloadcms/next/css';");
  });

  it('should add payload config path alias once to tsconfig.base.json', async () => {
    await applicationGenerator(tree, options);

    const tsConfig = JSON.parse(tree.read('tsconfig.base.json', 'utf-8'));
    expect(tsConfig.compilerOptions.paths['@payload-config']).toEqual([
      `./${options.directory}/src/payload.config.ts`
    ]);

    // Add another app and the process should not throw
    // due to the path already being added
    await applicationGenerator(tree, {
      ...options,
      name: 'new-app',
      directory: 'apps/new-app'
    });
  });

  describe('opt-out plugin inference (legacy apps)', () => {
    beforeAll(() => {
      process.env['NX_ADD_PLUGINS'] = 'false';
    });
    afterAll(() => {
      delete process.env['NX_ADD_PLUGINS'];
    });

    beforeEach(async () => {
      await applicationGenerator(tree, { ...options, addPlugin: undefined });
    });

    it('should not add any plugins to nx.json', async () => {
      const nxJson = readNxJson(tree);
      expect(nxJson.plugins).toBeUndefined();
    });

    it('should add all payload targets to project configuration', async () => {
      const projectJson = readProjectConfiguration(tree, options.name);
      for (const target of payloadTargets) {
        expect(projectJson.targets[target]).toBeDefined();
      }
    });

    it('should generate build outputs to project root', async () => {
      const projectJson = readProjectConfiguration(tree, options.name);
      expect(projectJson.targets?.build?.options?.outputPath).toBe(
        options.directory
      );
    });

    it('should disable linting', async () => {
      const projectJson = readProjectConfiguration(tree, options.name);
      expect(projectJson.targets?.lint?.executor).toBe('nx:noop');
    });
  });
});
