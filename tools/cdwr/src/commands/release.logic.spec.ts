import type { NxReleaseVersionResult } from 'nx/src/command-line/release/version';
import type { PackageJson } from 'nx/src/utils/package-json';

import {
  bumpSteps,
  decideRelease,
  hasNewVersion,
  publishSummary,
  publishableProjects,
  shouldRevertPackageJson
} from './release.logic';

type VersionData = NxReleaseVersionResult['projectsVersionData'];

const versionData = (entries: Record<string, string | null>): VersionData =>
  Object.fromEntries(
    Object.entries(entries).map(([project, newVersion]) => [
      project,
      { currentVersion: '1.0.0', newVersion, dependentProjects: [] }
    ])
  ) as VersionData;

describe('hasNewVersion', () => {
  it('is true when any project has a new version', () => {
    expect(hasNewVersion(versionData({ a: null, b: '1.1.0' }))).toBe(true);
  });

  it('is false when nothing changed', () => {
    expect(hasNewVersion(versionData({ a: null, b: null }))).toBe(false);
  });

  it('is false for an empty preview', () => {
    expect(hasNewVersion(versionData({}))).toBe(false);
  });
});

describe('bumpSteps', () => {
  it('lists one line per project with a new version, skipping the rest', () => {
    expect(bumpSteps(versionData({ a: '1.1.0', b: null, c: '2.0.0' }))).toEqual(
      ['Bump a to 1.1.0', 'Bump c to 2.0.0']
    );
  });
});

describe('decideRelease', () => {
  it('does nothing without a version bump, regardless of postponePublish', () => {
    expect(decideRelease(false, true)).toBe('nothing');
    expect(decideRelease(false, false)).toBe('nothing');
  });

  it('defers to GitHub Actions when postponed', () => {
    expect(decideRelease(true, true)).toBe('deferred');
  });

  it('publishes directly when not postponed', () => {
    expect(decideRelease(true, false)).toBe('publish');
  });
});

describe('publishableProjects', () => {
  it('keeps only projects with an nx-release-publish target', () => {
    const nodes = {
      'nx-payload': {
        name: 'nx-payload',
        type: 'lib',
        data: { targets: { 'nx-release-publish': {} } }
      },
      cms: { name: 'cms', type: 'app', data: { targets: { build: {} } } }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    expect(publishableProjects(nodes)).toEqual(['nx-payload']);
  });
});

describe('shouldRevertPackageJson', () => {
  const origin: PackageJson = {
    name: 'root',
    version: '1.0.0',
    devDependencies: { '@cdwr/nx-payload': '^1.0.0' }
  };

  it('reverts when nx-payload bumped and the root depends on it', () => {
    expect(
      shouldRevertPackageJson(origin, versionData({ 'nx-payload': '1.1.0' }))
    ).toBe(true);
  });

  it('does nothing when nx-payload did not bump', () => {
    expect(
      shouldRevertPackageJson(origin, versionData({ 'nx-payload': null }))
    ).toBe(false);
  });

  it('does nothing when the root has no such devDependency', () => {
    const bare: PackageJson = { name: 'root', version: '1.0.0' };
    expect(
      shouldRevertPackageJson(bare, versionData({ 'nx-payload': '1.1.0' }))
    ).toBe(false);
  });
});

describe('publishSummary', () => {
  it('reports a hard failure', () => {
    expect(publishSummary('release', null)).toEqual({
      summary: 'Release failed',
      partial: true
    });
    expect(publishSummary('publish', null)).toEqual({
      summary: 'Publish failed',
      partial: true
    });
  });

  it('reports nothing to publish', () => {
    expect(publishSummary('release', { successful: 0, total: 0 })).toEqual({
      summary: 'No packages to publish',
      partial: false
    });
  });

  it('reports a full success', () => {
    expect(publishSummary('release', { successful: 2, total: 2 })).toEqual({
      summary: 'Released successfully',
      partial: false
    });
    expect(publishSummary('publish', { successful: 2, total: 2 })).toEqual({
      summary: 'Published successfully',
      partial: false
    });
  });

  it('reports a partial success', () => {
    expect(publishSummary('release', { successful: 1, total: 2 })).toEqual({
      summary: 'Released 1 successfully, while 1 failed',
      partial: true
    });
  });

  it('reports a total failure with packages to publish', () => {
    expect(publishSummary('publish', { successful: 0, total: 2 })).toEqual({
      summary: 'Publish failed',
      partial: true
    });
  });
});
