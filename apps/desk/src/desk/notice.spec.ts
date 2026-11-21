import { describe, expect, it } from 'vitest';

import type { DataFailure } from '../data';

import { errorCopy, notice } from './notice';

const fail = (code: string, message = ''): DataFailure => ({ code, message });

describe('notice', () => {
  it('asks for settings before the adapter starts, whatever failed', () => {
    expect(notice(new Map([['runs', fail('network')]]), false)).toEqual({
      hidden: false,
      severe: false,
      text: 'Waiting for settings.'
    });
  });

  it('is hidden without errors', () => {
    expect(notice(new Map(), true)).toEqual({ hidden: true });
  });

  it('is not severe for a failure that keeps the last data', () => {
    expect(notice(new Map([['list:started', fail('network')]]), true)).toEqual({
      hidden: false,
      severe: false,
      text: "Can't reach Linear. Showing the last data; it refreshes when the connection is back."
    });
  });

  it('is severe when any failure retracts its data', () => {
    const n = notice(
      new Map([
        ['list:started', fail('network')],
        ['usage', fail('unauthorized')]
      ]),
      true
    );
    expect(n).toMatchObject({ hidden: false, severe: true });
  });

  it('joins the copy once per sentence, in the order the errors arrived', () => {
    const n = notice(
      new Map([
        ['list:triage', fail('network')],
        ['list:backlog', fail('network')],
        ['runs', fail('network')]
      ]),
      true
    );
    expect(n).toMatchObject({
      text: "Can't reach Linear. Showing the last data; it refreshes when the connection is back. Can't reach Supabase. Showing the last data; it refreshes when the connection is back."
    });
  });
});

describe('errorCopy', () => {
  it('names the source behind the key', () => {
    expect(errorCopy(fail('unauthorized'), 'usage')).toBe(
      'Supabase rejected the anon key. Check it in Settings.'
    );
    expect(errorCopy(fail('unauthorized'), 'ideas')).toBe(
      'Linear rejected the API key. Check it in Settings.'
    );
  });

  it('quotes the message of a refused request, or says none was given', () => {
    expect(errorCopy(fail('tool_error', 'bad field'), 'ideas')).toBe(
      'Linear refused the request: bad field'
    );
    expect(errorCopy(fail('tool_error'), 'ideas')).toBe(
      'Linear refused the request: no reason given'
    );
  });

  it('falls back to the message of a code it does not know', () => {
    expect(errorCopy(fail('boom', 'it broke'), 'runs')).toBe(
      "Couldn't load from Supabase: it broke"
    );
    expect(errorCopy(fail('boom'), 'runs')).toBe(
      "Couldn't load from Supabase: unknown error"
    );
  });
});
