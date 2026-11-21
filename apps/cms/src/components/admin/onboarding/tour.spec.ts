import { isFaqTopic } from '@codeware/app-cms/util/definitions';
import type { useAuth } from '@payloadcms/ui';

import { shouldAutoOpenTour } from './onboarding-preferences';
import { OPEN_TOUR_EVENT, openTour, takePendingTour } from './tour-events';
import {
  getTourPause,
  parseTourPause,
  setTourPause,
  subscribeTourPause
} from './tour-pause';
import {
  TOUR_MORE,
  TOUR_STEPS,
  splitShortcuts,
  visibleTourSteps
} from './tour-steps';

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

describe('splitShortcuts', () => {
  it('cuts the key combinations out as keys', () => {
    expect(splitShortcuts('Cmd+K / Ctrl+K finds every page.')).toEqual([
      ['⌘', 'K'],
      ' / ',
      ['Ctrl', 'K'],
      ' finds every page.'
    ]);
  });

  it('leaves text without a combination whole', () => {
    expect(splitShortcuts('Press Publish.')).toEqual(['Press Publish.']);
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

  it('keeps the request for a tour that mounts later, once', () => {
    takePendingTour();
    expect(takePendingTour()).toBe(false);
    openTour();
    expect(takePendingTour()).toBe(true);
    expect(takePendingTour()).toBe(false);
  });
});

describe('tour pause', () => {
  beforeEach(() => setTourPause(undefined));

  it('keeps the step across a page change', () => {
    setTourPause({ step: 2, user: '7' });
    expect(getTourPause('7')).toEqual({ step: 2, user: '7' });
  });

  it("hides another user's pause", () => {
    setTourPause({ step: 2, user: '7' });
    expect(getTourPause('8')).toBeUndefined();
    expect(getTourPause(undefined)).toBeUndefined();
  });

  it('returns the same snapshot while nothing changed', () => {
    setTourPause({ step: 3, user: '7' });
    expect(getTourPause('7')).toBe(getTourPause('7'));
  });

  it('clears the pause', () => {
    setTourPause({ step: 1, user: '7' });
    setTourPause(undefined);
    expect(getTourPause('7')).toBeUndefined();
  });

  it('tells its subscribers', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeTourPause(listener);
    setTourPause({ step: 0, user: '7' });
    unsubscribe();
    setTourPause(undefined);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignores a value it did not write', () => {
    for (const raw of [
      null,
      '',
      'nope',
      'null',
      '{"step":-1,"user":"7"}',
      '{"step":1.5,"user":"7"}',
      '{"step":1}',
      '{"step":1,"user":""}',
      '{"step":1,"user":7}'
    ]) {
      expect(parseTourPause(raw)).toBeUndefined();
    }
  });
});
