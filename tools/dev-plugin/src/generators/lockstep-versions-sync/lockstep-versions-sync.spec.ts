import type { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { describe, expect, it } from 'vitest';

import { syncLockstepVersions } from './lockstep-versions-sync';

type Deps = Record<string, string>;

function setup(manifest: {
  dependencies?: Deps;
  devDependencies?: Deps;
  [key: string]: unknown;
}): Tree {
  const tree = createTreeWithEmptyWorkspace();
  tree.write('package.json', JSON.stringify(manifest));
  return tree;
}

function manifestOf(tree: Tree) {
  return JSON.parse(tree.read('package.json', 'utf-8') ?? '{}') as {
    name?: string;
    dependencies: Deps;
    devDependencies: Deps;
  };
}

describe('syncLockstepVersions', () => {
  it('leaves aligned families alone', async () => {
    const tree = setup({
      dependencies: {
        payload: '3.90.2',
        '@payloadcms/next': '3.90.2',
        tailwindcss: '4.1.0',
        '@tailwindcss/postcss': '4.1.0',
        '@tailwindcss/typography': '^0.5.16'
      },
      devDependencies: {
        nx: '23.4.0',
        'create-nx-workspace': '23.4.0',
        '@nx/js': '23.4.0',
        '@nx/storybook': '23.4.0',
        storybook: '10.6.2',
        '@storybook/react-vite': '10.6.2',
        '@chromatic-com/storybook': '^5.1.2',
        vitest: '4.1.11',
        '@vitest/ui': '4.1.11',
        jest: '30.0.0',
        'jest-environment-node': '30.0.0',
        'babel-jest': '30.0.0',
        'ts-jest': '29.4.14',
        '@types/jest': '30.0.0'
      }
    });
    const before = tree.read('package.json', 'utf-8');

    expect(await syncLockstepVersions(tree)).toBeUndefined();
    expect(tree.read('package.json', 'utf-8')).toBe(before);
  });

  it('moves a split Storybook family to its highest version', async () => {
    const tree = setup({
      name: 'root',
      dependencies: { '@storybook/react-vite': '10.6.1' },
      devDependencies: {
        storybook: '10.6.2',
        '@storybook/addon-docs': '10.6.1'
      }
    });

    const result = await syncLockstepVersions(tree);

    expect(result?.outOfSyncMessage).toContain('Storybook');
    expect(result?.outOfSyncMessage).toContain('10.6.2');
    expect(result?.outOfSyncMessage).toContain('@storybook/addon-docs');
    expect(result?.outOfSyncMessage).toContain('@storybook/react-vite');
    const manifest = manifestOf(tree);
    expect(manifest.name).toBe('root');
    expect(manifest.devDependencies).toEqual({
      storybook: '10.6.2',
      '@storybook/addon-docs': '10.6.2'
    });
    expect(manifest.dependencies).toEqual({
      '@storybook/react-vite': '10.6.2'
    });
  });

  it('fixes a member in the section it lives in', async () => {
    const tree = setup({
      dependencies: { payload: '3.90.2' },
      devDependencies: { '@payloadcms/graphql': '3.90.1' }
    });

    expect(await syncLockstepVersions(tree)).toBeDefined();
    const manifest = manifestOf(tree);
    expect(manifest.dependencies).toEqual({ payload: '3.90.2' });
    expect(manifest.devDependencies).toEqual({
      '@payloadcms/graphql': '3.90.2'
    });
  });

  it.each<{ title: string; deps: Deps; expected: Deps }>([
    {
      title: 'a caret member at the highest version',
      deps: { vitest: '4.1.11', '@vitest/ui': '^4.1.11' },
      expected: { vitest: '4.1.11', '@vitest/ui': '4.1.11' }
    },
    {
      title: 'a caret member above the exact ones',
      deps: { nx: '23.3.0', '@nx/js': '^23.4.0' },
      expected: { nx: '23.4.0', '@nx/js': '23.4.0' }
    },
    {
      title: 'a numeric (not string) version comparison',
      deps: { storybook: '10.10.0', '@storybook/react': '10.9.0' },
      expected: { storybook: '10.10.0', '@storybook/react': '10.10.0' }
    },
    {
      title: 'a release over its prerelease',
      deps: { vitest: '1.0.0-rc.1', '@vitest/ui': '1.0.0' },
      expected: { vitest: '1.0.0', '@vitest/ui': '1.0.0' }
    }
  ])('picks the target for $title', async ({ deps, expected }) => {
    const tree = setup({ devDependencies: deps });

    expect(await syncLockstepVersions(tree)).toBeDefined();
    expect(manifestOf(tree).devDependencies).toEqual(expected);
  });

  it('leaves versioned-on-their-own packages untouched', async () => {
    const tree = setup({
      devDependencies: {
        tailwindcss: '4.1.0',
        '@tailwindcss/postcss': '4.0.0',
        '@tailwindcss/typography': '^0.5.16',
        jest: '30.0.1',
        'jest-environment-node': '30.0.0',
        'ts-jest': '29.4.14',
        '@types/jest': '30.0.0',
        nx: '23.4.0',
        '@nx/storybook': '23.3.0',
        storybook: '10.6.2',
        '@storybook/react': '10.6.2'
      }
    });

    expect(await syncLockstepVersions(tree)).toBeDefined();
    expect(manifestOf(tree).devDependencies).toEqual({
      tailwindcss: '4.1.0',
      '@tailwindcss/postcss': '4.1.0',
      '@tailwindcss/typography': '^0.5.16',
      jest: '30.0.1',
      'jest-environment-node': '30.0.1',
      'ts-jest': '29.4.14',
      '@types/jest': '30.0.0',
      nx: '23.4.0',
      '@nx/storybook': '23.4.0',
      storybook: '10.6.2',
      '@storybook/react': '10.6.2'
    });
  });

  it('skips a family when no member names a version', async () => {
    const tree = setup({ devDependencies: { storybook: 'latest' } });
    const before = tree.read('package.json', 'utf-8');

    expect(await syncLockstepVersions(tree)).toBeUndefined();
    expect(tree.read('package.json', 'utf-8')).toBe(before);
  });

  it('leaves protocol specs alone and reads no lower bound as a pin', async () => {
    const tree = setup({
      devDependencies: {
        storybook: '10.6.2',
        '@storybook/react': 'catalog:',
        '@storybook/addon-docs': 'npm:@fork/addon-docs@1.0.0',
        '@storybook/addon-a11y': '>=10.7.0'
      }
    });

    expect(await syncLockstepVersions(tree)).toBeDefined();
    expect(manifestOf(tree).devDependencies).toEqual({
      storybook: '10.6.2',
      '@storybook/react': 'catalog:',
      '@storybook/addon-docs': 'npm:@fork/addon-docs@1.0.0',
      '@storybook/addon-a11y': '10.6.2'
    });
  });

  it('is idempotent after a fix', async () => {
    const tree = setup({
      devDependencies: { nx: '23.3.0', '@nx/js': '^23.4.0' }
    });

    expect(await syncLockstepVersions(tree)).toBeDefined();
    expect(await syncLockstepVersions(tree)).toBeUndefined();
  });
});
