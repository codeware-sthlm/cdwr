import { describe, expect, it } from 'vitest';

import { hostName, reasonChipData, sessionLabel } from './labels';

describe('labels', () => {
  it('labels a session state, and passes one it does not know through', () => {
    expect(sessionLabel('waiting')).toBe('Session waits on you');
    expect(sessionLabel('odd')).toBe('odd');
  });

  it('names a job host', () => {
    expect(hostName('container')).toBe('Container');
  });

  it('shows a reason the page does not list as it is', () => {
    expect(reasonChipData('take over')).toEqual(['take over', 'takeover']);
    expect(reasonChipData('conflicts with main')).toEqual([
      'conflicts with main',
      'conflict'
    ]);
    expect(reasonChipData('odd')).toEqual(['odd', 'resume']);
    expect(reasonChipData(undefined)).toEqual([undefined, 'resume']);
  });
});
