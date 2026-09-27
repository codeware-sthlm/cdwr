import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FONTS,
  FONT_FAMILIES,
  type FontSlot,
  entitledFonts,
  fontById,
  fontFaceCss,
  fontStack,
  fontsForSlot,
  isRestrictedFont,
  selfServedFontsIn
} from './fonts';

const SLOTS: ReadonlyArray<FontSlot> = ['body', 'heading', 'mono'];

describe('the registry', () => {
  it('has no duplicate ids', () => {
    const ids = FONT_FAMILIES.map((font) => font.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // `customThemeCss` rejects quotes outright, so a quoted stack would pass
  // every test here and then be dropped at render time, leaving the token empty
  it.each(FONT_FAMILIES)('$id carries an unquoted stack', (font) => {
    expect(font.stack).not.toMatch(/['"]/);
  });

  // Contains rather than ends with: the system stack puts the generic family
  // before the emoji faces on purpose, so those are consulted for emoji
  // codepoints while everything else still has a guaranteed fallback
  it.each(FONT_FAMILIES)('$id carries a generic family', (font) => {
    expect(font.stack.split(',').map((f) => f.trim())).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^(sans-serif|serif|monospace)$/)
      ])
    );
  });

  // A registered face nothing declares falls back silently, so the stylesheet
  // is held to the registry rather than trusted to keep up with it
  it.each(FONT_FAMILIES.filter((font) => font.bundled))(
    '$id is declared by the shared stylesheet',
    (font) => {
      const css = readFileSync(
        new URL('../../../../theme/src/lib/_core/fonts.css', import.meta.url),
        'utf8'
      );
      for (const sheet of font.bundled ?? []) {
        expect(css).toContain(`@import '${sheet}';`);
      }
    }
  );

  // Either the platform serves the file or npm does; a family with neither
  // has nothing to render with but the system's
  it.each(FONT_FAMILIES.filter((font) => !font.stack.startsWith('ui-')))(
    '$id has a source',
    (font) => {
      expect(Boolean(font.file) !== Boolean(font.bundled?.length)).toBe(true);
    }
  );

  it.each(SLOTS)('%s has a default that fills it', (slot) => {
    const font = fontById(DEFAULT_FONTS[slot]);
    expect(font?.slots).toContain(slot);
  });

  // A default a tenant cannot be given would make every new theme unsavable
  it.each(SLOTS)('%s default is not restricted', (slot) => {
    expect(isRestrictedFont(DEFAULT_FONTS[slot])).toBe(false);
  });
});

describe('fontsForSlot', () => {
  it('hides a restricted family by default', () => {
    expect(fontsForSlot('heading').map((f) => f.id)).not.toContain(
      'nasalization'
    );
  });

  it('offers it once the gate is open', () => {
    expect(fontsForSlot('heading', true).map((f) => f.id)).toContain(
      'nasalization'
    );
  });

  it('never offers a family for a slot it does not fill', () => {
    expect(fontsForSlot('body', true).map((f) => f.id)).not.toContain(
      'nasalization'
    );
  });

  it.each(SLOTS)('%s offers something without the gate', (slot) => {
    expect(fontsForSlot(slot).length).toBeGreaterThan(0);
  });
});

describe('fontStack', () => {
  it('resolves a known family', () => {
    expect(fontStack('body', 'inter')).toBe(fontById('inter')?.stack);
  });

  // Stored data outlives the registry: a family dropped from the set has to
  // read as the default rather than as an empty token
  it('falls back for an id that no longer exists', () => {
    expect(fontStack('body', 'dropped-family')).toBe(
      fontById(DEFAULT_FONTS.body)?.stack
    );
  });

  it('falls back for a family used in the wrong slot', () => {
    expect(fontStack('body', 'nasalization')).toBe(
      fontById(DEFAULT_FONTS.body)?.stack
    );
  });

  it('falls back for a missing id', () => {
    expect(fontStack('mono', undefined)).toBe(
      fontById(DEFAULT_FONTS.mono)?.stack
    );
  });
});

describe('isRestrictedFont', () => {
  it('reports a licensed family', () => {
    expect(isRestrictedFont('nasalization')).toBe(true);
  });

  it('reports a freely usable one', () => {
    expect(isRestrictedFont('inter')).toBe(false);
  });

  // Unknown is not restricted — it is unknown, and resolves to the default.
  // Reporting it as restricted would refuse a save for the wrong reason
  it('does not treat an unknown family as restricted', () => {
    expect(isRestrictedFont('dropped-family')).toBe(false);
  });
});

describe('fontFaceCss', () => {
  const nasalization = fontById('nasalization');
  const inter = fontById('inter');
  const base = 'https://assets.example.com/fonts';

  it('writes a face for a self-served family', () => {
    const css = fontFaceCss(nasalization as never, base);

    expect(css).toContain('font-family:Nasalization');
    expect(css).toContain(
      `url(${base}/nasalization-rg-webfont.woff2) format('woff2')`
    );
    // A display face must not hold up the first paint
    expect(css).toContain('font-display:swap');
  });

  it('tolerates a trailing slash on the base', () => {
    expect(fontFaceCss(nasalization as never, `${base}/`)).toBe(
      fontFaceCss(nasalization as never, base)
    );
  });

  // Inter comes from npm and is declared by fontsource; writing a second face
  // for it would fetch bytes the platform does not serve
  it('writes nothing for a family with no file', () => {
    expect(fontFaceCss(inter as never, base)).toBe('');
  });

  // Unconfigured is the safe state: no base means no face, rather than a
  // relative URL resolving against whatever page happens to be rendering
  it('writes nothing without a base', () => {
    expect(fontFaceCss(nasalization as never, undefined)).toBe('');
    expect(fontFaceCss(nasalization as never, '')).toBe('');
  });

  // The result lands in a `<style>` block, so anything that could close the
  // declaration or leave CSS has to be impossible rather than unlikely
  it.each([
    'http://assets.example.com/fonts',
    'https://a.com/f) format("woff2");} body{display:none',
    'https://a.com/f<script>',
    "https://a.com/f'",
    'javascript:alert(1)',
    '//assets.example.com/fonts'
  ])('refuses the unsafe base %s', (unsafe) => {
    expect(fontFaceCss(nasalization as never, unsafe)).toBe('');
  });

  // Single quotes are emitted on purpose, in `format('woff2')` — what must not
  // appear is anything that could end the block early or leave CSS
  it('closes exactly one block and never leaves CSS', () => {
    const css = fontFaceCss(nasalization as never, base);

    expect(css).not.toMatch(/["<>]/);
    expect(css.match(/\}/g) ?? []).toHaveLength(1);
  });
});

describe('selfServedFontsIn', () => {
  const nasalization = 'Nasalization, Inter Variable, Inter, sans-serif';

  it('finds a self-served family a token names', () => {
    expect(
      selfServedFontsIn([{ '--core-font-heading': nasalization }]).map(
        (f) => f.id
      )
    ).toEqual(['nasalization']);
  });

  // The tokens are what renders — a hand-edited value names a family just as
  // a chosen one does, and the recipe would not have seen it
  it('finds it in a hand-edited token, not only a generated one', () => {
    expect(
      selfServedFontsIn([{ '--core-font-body': `${nasalization}` }])
    ).toHaveLength(1);
  });

  it('reports a family named twice only once', () => {
    expect(
      selfServedFontsIn([
        { '--core-font-heading': nasalization },
        { '--core-font-heading': nasalization }
      ])
    ).toHaveLength(1);
  });

  // Inter is declared by fontsource; writing a face for it would fetch bytes
  // the platform does not serve
  it('ignores a family the platform does not serve itself', () => {
    expect(
      selfServedFontsIn([
        { '--core-font-body': 'Inter Variable, Inter, sans-serif' }
      ])
    ).toEqual([]);
  });

  it('ignores a token that is not a font', () => {
    expect(selfServedFontsIn([{ '--core-link': nasalization }])).toEqual([]);
  });

  // Substring matching would fire on a family merely sharing a prefix
  it('matches a whole family, not a fragment', () => {
    expect(
      selfServedFontsIn([{ '--core-font-heading': 'Nasalizationish, serif' }])
    ).toEqual([]);
  });

  it.each([[], [{}], [{ '--core-font-body': 42 }]])(
    'finds nothing in %p',
    (...maps) => {
      expect(selfServedFontsIn(maps as never)).toEqual([]);
    }
  );
});

describe('entitledFonts', () => {
  const restricted = fontById('nasalization') as never;
  const open = fontById('inter') as never;
  const all = [open, restricted];

  it('lets an unrestricted family through without a grant', () => {
    expect(entitledFonts([open], undefined)).toEqual([open]);
  });

  it('drops a licensed family with no grant at all', () => {
    expect(entitledFonts(all, undefined)).toEqual([open]);
  });

  it('allows a family the grant names', () => {
    expect(entitledFonts(all, 'nasalization')).toEqual(all);
  });

  // The whole point of naming ids: a grant is for one font, not for the
  // deployment's whole future
  it('does not extend a grant to another licensed family', () => {
    const other = { ...restricted, id: 'other-licensed' };

    expect(entitledFonts([other as never], 'nasalization')).toEqual([]);
  });

  it('reads several ids, and tolerates spacing', () => {
    expect(entitledFonts(all, ' other-licensed , nasalization ')).toEqual(all);
  });

  // Malformed config must narrow, never widen
  it.each(['', ',,', '   ', 'nasalizationish'])(
    'grants nothing for %p',
    (granted) => {
      expect(entitledFonts(all, granted)).toEqual([open]);
    }
  );
});
