import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { contrastFailures } from './contrast';

/**
 * Every built-in theme has to pass its own contrast check.
 *
 * The platform's strongest claim is that an inaccessible colour theme cannot be
 * published on it. Shipping a built-in that fails would make the claim false in
 * the most embarrassing way available, and it went unnoticed once already:
 * `shadcn` and `codeware` both failed the focus ring in light mode until this
 * test was written.
 *
 * Read from the CSS rather than imported, because `type:theme` is a
 * dependency-free leaf and importing it here would give it a dependant.
 */
const THEME_ROOT = join(__dirname, '../../../../theme/src/lib');

const BUILT_INS = ['shadcn', 'spotlight', 'spotlight-fork', 'codeware'];

/** Pull `--token: value` declarations out of a token stylesheet. */
const declarations = (css: string): Record<string, string> => {
  const tokens: Record<string, string> = {};
  for (const [, name, value] of css.matchAll(
    /(--[a-z0-9-]+)\s*:\s*([^;}]+)[;}]/gi
  )) {
    tokens[name] = value.trim();
  }
  return tokens;
};

const tokensFor = (theme: string, scheme: 'light' | 'dark') => {
  const file = join(THEME_ROOT, theme, `tokens-${scheme}.css`);

  // A moved or renamed theme directory should fail loudly here rather than
  // quietly checking an empty token set and passing
  expect(existsSync(file)).toBe(true);

  const light = declarations(
    readFileSync(join(THEME_ROOT, theme, 'tokens-light.css'), 'utf8')
  );

  // Dark is checked merged over light, the way the browser cascades it
  return scheme === 'light'
    ? light
    : { ...light, ...declarations(readFileSync(file, 'utf8')) };
};

describe('built-in themes', () => {
  it.each(BUILT_INS)('%s passes contrast in light mode', (theme) => {
    expect(contrastFailures(tokensFor(theme, 'light'))).toEqual([]);
  });

  it.each(BUILT_INS)('%s passes contrast in dark mode', (theme) => {
    expect(contrastFailures(tokensFor(theme, 'dark'))).toEqual([]);
  });

  it('is actually reading tokens, not an empty object', () => {
    // The regex silently returning nothing would make every case above pass
    expect(Object.keys(tokensFor('shadcn', 'light')).length).toBeGreaterThan(
      20
    );
  });
});
