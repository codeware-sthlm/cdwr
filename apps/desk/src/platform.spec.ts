// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { isTauri, tauriFetch, tauriOpenUrl, tauriLoad, tauriStore } = vi.hoisted(
  () => {
    const tauriStore = {
      get: vi.fn(() => Promise.resolve('from-tauri')),
      set: vi.fn(() => Promise.resolve()),
      save: vi.fn(() => Promise.resolve())
    };
    return {
      isTauri: vi.fn(() => false),
      tauriFetch: vi.fn(() => Promise.resolve(new Response('tauri'))),
      tauriOpenUrl: vi.fn(() => Promise.resolve()),
      tauriLoad: vi.fn(() => Promise.resolve(tauriStore)),
      tauriStore
    };
  }
);

vi.mock('@tauri-apps/api/core', () => ({ isTauri }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: tauriFetch }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: tauriOpenUrl }));
vi.mock('@tauri-apps/plugin-store', () => ({ load: tauriLoad }));

import { platform } from './platform';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  isTauri.mockReturnValue(false);
});

describe('platform in a browser', () => {
  it('fetches with the global fetch', async () => {
    const globalFetch = vi.fn(() => Promise.resolve(new Response('web')));
    vi.stubGlobal('fetch', globalFetch);
    const response = await platform.fetch('https://api.linear.app/graphql');
    expect(await response.text()).toBe('web');
    expect(globalFetch).toHaveBeenCalledOnce();
    expect(tauriFetch).not.toHaveBeenCalled();
  });

  it('opens links in a new tab without an opener', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await platform.openUrl('https://example.com');
    expect(open).toHaveBeenCalledWith(
      'https://example.com',
      '_blank',
      'noopener'
    );
    expect(tauriOpenUrl).not.toHaveBeenCalled();
  });

  it('keeps settings in localStorage across a reload', async () => {
    const first = await platform.settingsStore();
    await first.set('linearKey', 'lin_api_abc');
    await first.save();
    const second = await platform.settingsStore();
    expect(await second.get('linearKey')).toBe('lin_api_abc');
    expect(localStorage.getItem('desk:linearKey')).toBe('"lin_api_abc"');
    expect(await second.get('missing')).toBeUndefined();
    expect(tauriLoad).not.toHaveBeenCalled();
  });

  it('falls back to memory when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const store = await platform.settingsStore();
    expect(await store.get('linearKey')).toBeUndefined();
    await store.set('linearKey', 'lin_api_abc');
    await store.save();
    expect(await store.get('linearKey')).toBe('lin_api_abc');
  });
});

describe('platform in Tauri', () => {
  beforeEach(() => {
    isTauri.mockReturnValue(true);
  });

  it('fetches through the http plugin', async () => {
    const response = await platform.fetch('https://api.linear.app/graphql');
    expect(await response.text()).toBe('tauri');
    expect(tauriFetch).toHaveBeenCalledOnce();
  });

  it('opens links through the opener plugin', async () => {
    const open = vi.spyOn(window, 'open');
    await platform.openUrl('https://example.com');
    expect(tauriOpenUrl).toHaveBeenCalledWith('https://example.com');
    expect(open).not.toHaveBeenCalled();
  });

  it('stores settings through the store plugin', async () => {
    const store = await platform.settingsStore();
    expect(tauriLoad).toHaveBeenCalledWith('settings.json', {
      autoSave: false
    });
    expect(await store.get('linearKey')).toBe('from-tauri');
    await store.set('linearKey', 'x');
    await store.save();
    expect(tauriStore.set).toHaveBeenCalledWith('linearKey', 'x');
    expect(tauriStore.save).toHaveBeenCalledOnce();
    expect(localStorage.length).toBe(0);
  });
});
