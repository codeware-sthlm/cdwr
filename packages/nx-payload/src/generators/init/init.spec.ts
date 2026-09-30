import { join } from 'path';

import {
  NX_VERSION,
  type Tree,
  addDependenciesToPackageJson,
  readJson,
  readJsonFile
} from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import type { PackageJson } from 'nx/src/utils/package-json';

import {
  graphqlVersion,
  next16Version,
  payloadVersion
} from '../../utils/versions';

import { initGenerator } from './init';
import { nxPeers } from './libs/update-dependencies';
import type { InitSchema } from './schema';

describe('init', () => {
  let tree: Tree;
  const options: InitSchema = {
    skipFormat: true
  };

  console.log = jest.fn();
  console.warn = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    tree = createTreeWithEmptyWorkspace();
  });

  it('should use Payload version', async () => {
    await initGenerator(tree, options);
    const packageJson = readJson<PackageJson>(tree, 'package.json');

    expect(packageJson).toMatchObject({
      dependencies: {
        '@payloadcms/db-mongodb': payloadVersion,
        '@payloadcms/db-postgres': payloadVersion,
        '@payloadcms/next': payloadVersion,
        '@payloadcms/richtext-lexical': payloadVersion,
        payload: payloadVersion
      },
      devDependencies: {
        '@payloadcms/graphql': payloadVersion
      }
    });
  });

  it('should add external dependencies', async () => {
    await initGenerator(tree, options);
    const packageJson = readJson<PackageJson>(tree, 'package.json');

    expect(packageJson).toMatchObject({
      dependencies: {
        graphql: graphqlVersion,
        next: next16Version
      }
    });
  });

  it('should add the Nx plugins it builds on at the installed nx version', async () => {
    await initGenerator(tree, options);
    const packageJson = readJson<PackageJson>(tree, 'package.json');

    for (const name of nxPeers) {
      expect(packageJson.devDependencies[name]).toBe(NX_VERSION);
    }
  });

  it('should align every @nx peer the plugin declares', () => {
    const { peerDependencies = {} } = readJsonFile<PackageJson>(
      join(__dirname, '..', '..', '..', 'package.json')
    );
    const declared = Object.keys(peerDependencies)
      .filter((name) => name.startsWith('@nx/'))
      .sort();

    expect([...nxPeers].sort()).toEqual(declared);
  });

  it('should not add or downgrade Next.js when already present', async () => {
    // A workspace already on Next 15 is kept as-is (Payload v3.86 still
    // supports Next 15), never downgraded or bumped to the v16 default.
    const existingNextVersion = '15.2.9';
    addDependenciesToPackageJson(tree, { next: existingNextVersion }, {});

    await initGenerator(tree, options);
    const packageJson = readJson<PackageJson>(tree, 'package.json');

    expect(packageJson.dependencies['next']).toBe(existingNextVersion);
  });

  it('should keep existing dependencies', async () => {
    const existing = 'existing';
    const existingVersion = '1.0.0';
    const dependencies = {
      [existing]: existingVersion
    };
    const devDependencies = {
      [existing]: existingVersion
    };
    addDependenciesToPackageJson(tree, dependencies, devDependencies);

    await initGenerator(tree, options);
    const packageJson = readJson<PackageJson>(tree, 'package.json');

    expect(packageJson.dependencies[existing]).toBeDefined();
    expect(packageJson.devDependencies[existing]).toBeDefined();
  });
});
