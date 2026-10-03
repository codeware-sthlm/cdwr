import { describe, expect, it } from 'vitest';

import { editorHeight, modelUri } from './monaco';

describe('editorHeight', () => {
  it('has a floor and a ceiling', () => {
    expect(editorHeight(0)).toBe(240);
    expect(editorHeight(5)).toBe(240);
    expect(editorHeight(10000)).toBe(640);
  });

  it('grows with the line count in between', () => {
    expect(editorHeight(30)).toBeGreaterThan(editorHeight(20));
    expect(editorHeight(30)).toBeLessThan(640);
  });
});

describe('modelUri', () => {
  it('ends in .tsx so JSX is on', () => {
    expect(modelUri('component')).toBe('file:///studio/component.tsx');
    expect(modelUri('custom components/a.b')).toBe(
      'file:///studio/custom-components/a-b.tsx'
    );
  });
});
