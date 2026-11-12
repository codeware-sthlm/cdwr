// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Settings } from '../../settings';

import { SettingsForm } from './settings';

const GOOD: Settings = {
  linearKey: 'lin_api_abc123',
  supabaseUrl: 'https://abcdefghij0123456789.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi.eyJyb2xlIjoi.c2lnbmF0dXJl',
  controlToken: ''
};

const form = (
  o: {
    current?: Settings | null;
    verify?: () => Promise<{ field: keyof Settings; message: string }[]>;
    onSaved?: () => Promise<void>;
    onDone?: () => void;
  } = {}
) =>
  render(
    <SettingsForm
      current={o.current ?? null}
      verify={o.verify ?? (async () => [])}
      onSaved={o.onSaved ?? (async () => undefined)}
      onDone={o.onDone ?? (() => undefined)}
    />
  );

const save = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

describe('SettingsForm', () => {
  it('starts on the first field', () => {
    form();
    expect(document.activeElement?.id).toBe('settings-linearKey');
  });

  it('shows an invalid field its error and focuses it', async () => {
    form({ current: { ...GOOD, supabaseUrl: 'not a url' } });
    save();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(document.activeElement?.id).toBe('settings-supabaseUrl');
  });

  it('shows what the connection check found, per field', async () => {
    const onSaved = vi.fn(async () => undefined);
    form({
      current: GOOD,
      verify: async () => [{ field: 'linearKey', message: 'Linear refused' }],
      onSaved
    });
    save();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Linear refused'
    );
    expect(document.activeElement?.id).toBe('settings-linearKey');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('saves good settings, then closes', async () => {
    const onSaved = vi.fn(async () => undefined);
    const onDone = vi.fn();
    form({ current: GOOD, onSaved, onDone });
    save();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalledWith(GOOD);
  });

  it('shows and hides the keys', () => {
    form();
    const key = screen.getByLabelText('Linear API key');
    expect(key.getAttribute('type')).toBe('password');
    const toggle = screen.getByRole('button', { name: 'Show keys' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(key.getAttribute('type')).toBe('text');
    expect(
      screen.getByLabelText('Supabase project URL').getAttribute('type')
    ).toBe('text');
  });
});
