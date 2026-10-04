import { describe, expect, it } from 'vitest';

import { scopeStyles } from './scope-styles';

const css = `
@layer properties {
  @supports (color: red) {
    *, ::before { --tw-border-style: solid; }
  }
}
@layer utilities {
  .flex-col { flex-direction: column; }
  @media (min-width: 40rem) {
    .sm\\:flex-row { flex-direction: row; }
  }
  .group:hover .peer, .a > .b { color: red; }
}
@property --tw-border-style { syntax: "*"; inherits: false; initial-value: solid; }
@keyframes spin { to { transform: rotate(360deg); } }
`;

describe('scopeStyles', () => {
  const scoped = scopeStyles(css, 'cdwr-x-card');

  it('prefixes every selector with the element, at zero specificity', () => {
    expect(scoped).toContain(':where(cdwr-x-card) .flex-col');
    expect(scoped).toContain(':where(cdwr-x-card) .sm\\:flex-row');
    expect(scoped).toContain(
      ':where(cdwr-x-card) *, :where(cdwr-x-card) ::before'
    );
  });

  it('prefixes each selector of a list on its own', () => {
    expect(scoped).toContain(
      ':where(cdwr-x-card) .group:hover .peer, :where(cdwr-x-card) .a > .b'
    );
  });

  it('leaves keyframes and property registrations alone', () => {
    expect(scoped).toContain('@keyframes spin { to {');
    expect(scoped).not.toContain(':where(cdwr-x-card) to');
    expect(scoped).toContain('@property --tw-border-style {');
  });

  it('keeps the layers and media queries in place', () => {
    expect(scoped).toMatch(
      /@layer utilities \{[\s\S]*@media \(min-width: 40rem\)/
    );
  });
});
