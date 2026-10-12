import { describe, expect, it } from 'vitest';

import { type EmailLayout, renderEmailLayout } from './layout';

const input = {
  title: 'Your place is confirmed',
  paragraphs: [
    'Hi Anna Berg,',
    'Your place on Barolo & Barbaresco is <b>confirmed</b>.'
  ],
  detailsHeading: 'Details',
  details: [
    ['Tour', 'Barolo & Barbaresco'],
    ['People', '2']
  ],
  links: [{ label: 'Privacy', url: 'https://example.com/privacy?a=1&b=2' }],
  from: 'Titan Tours'
} satisfies EmailLayout;

// Captured from the layout before brand and cta existed
const UNBRANDED_HTML =
  '<!doctype html><html><head><meta charset="utf-8"><title>Your place is confirmed</title></head><body style="margin:0;padding:24px;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;color:#1a1a1a"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:32px"><p style="margin:0 0 16px;line-height:1.6">Hi Anna Berg,</p><p style="margin:0 0 16px;line-height:1.6">Your place on Barolo &amp; Barbaresco is &lt;b&gt;confirmed&lt;/b&gt;.</p><h2 style="margin:24px 0 8px;font-size:16px">Details</h2><table style="border-collapse:collapse;margin:0 0 16px" role="presentation"><tr><td style="padding:4px 16px 4px 0;color:#666">Tour</td><td style="padding:4px 0">Barolo &amp; Barbaresco</td></tr><tr><td style="padding:4px 16px 4px 0;color:#666">People</td><td style="padding:4px 0">2</td></tr></table><p style="margin:24px 0 0">Titan Tours</p><p style="margin:24px 0 0;font-size:12px;color:#666"><a href="https://example.com/privacy?a=1&amp;b=2" style="color:#666">Privacy</a></p></div></body></html>';
const UNBRANDED_TEXT =
  'Hi Anna Berg,\nYour place on Barolo & Barbaresco is <b>confirmed</b>.\n\nDetails\nTour: Barolo & Barbaresco\nPeople: 2\n\nTitan Tours\n\nPrivacy: https://example.com/privacy?a=1&b=2';

describe('renderEmailLayout', () => {
  it('renders byte-identical output without brand and cta', () => {
    const { html, text } = renderEmailLayout(input);

    expect(html).toBe(UNBRANDED_HTML);
    expect(text).toBe(UNBRANDED_TEXT);
  });

  describe('brand', () => {
    const brand = {
      name: 'Titan Tours',
      logoUrl: 'https://titan.example/site-icon.png?size=64',
      accent: '#0e7490'
    };

    it('renders a header with a 32x32 logo and the name', () => {
      const { html, text } = renderEmailLayout({ ...input, brand });

      expect(html).toContain(
        '<img src="https://titan.example/site-icon.png?size=64" alt="Titan Tours" width="32" height="32"'
      );
      expect(html).toContain('>Titan Tours</td>');
      expect(text.startsWith('Titan Tours\n\n')).toBe(true);
    });

    it('leaves the logo out when there is none', () => {
      const { html } = renderEmailLayout({
        ...input,
        brand: { name: 'Titan Tours' }
      });

      expect(html).not.toContain('<img');
      expect(html).toContain('>Titan Tours</td>');
    });

    it('colours links with the accent, or the neutral colour without one', () => {
      const accented = renderEmailLayout({ ...input, brand }).html;
      expect(accented).toContain('style="color:#0e7490">Privacy</a>');

      const neutral = renderEmailLayout({
        ...input,
        brand: { name: 'Titan Tours' }
      }).html;
      expect(neutral).toContain('style="color:#666666">Privacy</a>');
    });

    it('escapes the name and logo url', () => {
      const { html } = renderEmailLayout({
        ...input,
        brand: {
          name: '<b>"A" & B',
          logoUrl: 'https://x.example/a?b="1"&c=<2>'
        }
      });

      expect(html).toContain('&lt;b&gt;&quot;A&quot; &amp; B');
      expect(html).toContain(
        'src="https://x.example/a?b=&quot;1&quot;&amp;c=&lt;2&gt;"'
      );
      expect(html).not.toContain('<b>"A"');
    });
  });

  describe('cta', () => {
    const cta = { label: 'Open tour', url: 'https://titan.example/t?a=1&b=2' };

    it('renders a bulletproof button in the accent colour', () => {
      const { html } = renderEmailLayout({
        ...input,
        brand: { name: 'Titan Tours', accent: '#0e7490' },
        cta
      });

      expect(html).toContain(
        '<table style="border-collapse:collapse;margin:8px 0 16px" role="presentation">'
      );
      expect(html).toContain('background:#0e7490');
      expect(html).toContain('color:#ffffff');
      expect(html).toContain('href="https://titan.example/t?a=1&amp;b=2"');
      expect(html).toContain('>Open tour</a>');
    });

    it('spells the url out as a fallback in html and text', () => {
      const { html, text } = renderEmailLayout({ ...input, cta });

      expect(html).toContain(
        'Open tour: <a href="https://titan.example/t?a=1&amp;b=2"'
      );
      expect(html).toContain('>https://titan.example/t?a=1&amp;b=2</a></p>');
      expect(text).toContain('Open tour: https://titan.example/t?a=1&b=2');
    });

    it('escapes label and url', () => {
      const { html } = renderEmailLayout({
        ...input,
        cta: { label: '<go> "now" & then', url: 'https://x.example/?q="<"&r=1' }
      });

      expect(html).toContain('&lt;go&gt; &quot;now&quot; &amp; then');
      expect(html).toContain(
        'href="https://x.example/?q=&quot;&lt;&quot;&amp;r=1"'
      );
      expect(html).not.toContain('<go>');
    });
  });
});
