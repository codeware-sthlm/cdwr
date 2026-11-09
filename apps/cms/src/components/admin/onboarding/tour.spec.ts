import { isFaqTopic } from '@codeware/app-cms/util/definitions';
import type { useAuth } from '@payloadcms/ui';

import { shouldAutoOpenTour } from './onboarding-preferences';
import { OPEN_TOUR_EVENT, openTour } from './tour-events';
import { TOUR_MORE, TOUR_STEPS, visibleTourSteps } from './tour-steps';

type Permissions = ReturnType<typeof useAuth>['permissions'];

const canUpdate = (...slugs: string[]) =>
  ({
    collections: Object.fromEntries(
      slugs.map((slug) => [slug, { read: true, update: true }])
    )
  }) as unknown as Permissions;

describe('visibleTourSteps', () => {
  it('shows every step to a workspace admin', () => {
    const steps = visibleTourSteps(
      canUpdate('pages', 'navigation', 'site-settings')
    );
    expect(steps.map((s) => s.topic)).toEqual([
      'pages',
      'drafts',
      'navigation',
      'site-settings',
      'search-help'
    ]);
  });

  it('skips menu and site settings for an editor', () => {
    const steps = visibleTourSteps(canUpdate('pages'));
    expect(steps.map((s) => s.topic)).toEqual([
      'pages',
      'drafts',
      'search-help'
    ]);
  });

  it('counts a scoped permission as allowed', () => {
    const permissions = {
      collections: { pages: { update: { permission: true, where: {} } } }
    } as unknown as Permissions;
    expect(visibleTourSteps(permissions).map((s) => s.topic)).toContain(
      'pages'
    );
  });

  it('keeps search & help without any permissions', () => {
    expect(visibleTourSteps(undefined).map((s) => s.topic)).toEqual([
      'search-help'
    ]);
  });
});

describe('tour topics', () => {
  it('lead every step and closing link into an FAQ topic', () => {
    for (const { topic } of [...TOUR_STEPS, ...TOUR_MORE]) {
      expect(isFaqTopic(topic)).toBe(true);
    }
  });
});

describe('shouldAutoOpenTour', () => {
  const base = {
    preferences: undefined,
    role: 'user' as const,
    showBuildSite: false
  };

  it('opens for a user who has not seen the tour', () => {
    expect(shouldAutoOpenTour(base)).toBe(true);
    expect(shouldAutoOpenTour({ ...base, preferences: {} })).toBe(true);
  });

  it('stays closed once the tour was seen', () => {
    expect(
      shouldAutoOpenTour({
        ...base,
        preferences: { tourSeenAt: '2026-11-09T21:00:00.000Z' }
      })
    ).toBe(false);
  });

  it('never opens by itself for a system user or without a user', () => {
    expect(shouldAutoOpenTour({ ...base, role: 'system-user' })).toBe(false);
    expect(shouldAutoOpenTour({ ...base, role: undefined })).toBe(false);
  });

  it('waits while the workspace still needs its first site', () => {
    expect(shouldAutoOpenTour({ ...base, showBuildSite: true })).toBe(false);
  });
});

describe('openTour', () => {
  it('dispatches the open event', () => {
    const listener = jest.fn();
    window.addEventListener(OPEN_TOUR_EVENT, listener);
    openTour();
    window.removeEventListener(OPEN_TOUR_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
