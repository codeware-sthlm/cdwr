import { storedIllustration } from './illustration.field';

describe('storedIllustration', () => {
  it('stores a blank drawing as none', () => {
    expect(storedIllustration('')).toBeNull();
    expect(storedIllustration('  \n\t ')).toBeNull();
  });

  it('leaves a value that is not text alone', () => {
    expect(storedIllustration(null)).toBeNull();
    expect(storedIllustration(undefined)).toBeUndefined();
  });

  it('sanitises a drawing and keeps what it draws with', () => {
    const stored = storedIllustration(
      '<svg viewBox="0 0 10 10" onload="alert(1)"><circle cx="5" cy="5" r="4" fill="var(--brand-500)"/><script>alert(1)</script></svg>'
    );
    expect(stored).toContain('viewBox="0 0 10 10"');
    expect(stored).toContain('fill="var(--brand-500)"');
    expect(stored).not.toMatch(/onload|script/);
  });
});
