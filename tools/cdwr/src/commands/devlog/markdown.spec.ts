import { describe, expect, it } from 'vitest';

import { markdownToLexical } from './markdown';

describe('markdownToLexical', () => {
  it('converts paragraphs, headings, lists and links without a database', async () => {
    const json = await markdownToLexical(
      [
        '2026-11-12',
        '',
        'The agent now **drafts** posts. See [the site](https://cdwr.io).',
        '',
        '## What changed',
        '',
        '- one',
        '- two'
      ].join('\n')
    );
    const root = json['root'] as { children: { type: string }[] };
    expect(root.children.map((c) => c.type)).toEqual([
      'paragraph',
      'paragraph',
      'heading',
      'list'
    ]);
    expect(JSON.stringify(json)).toContain('"url":"https://cdwr.io"');
  });

  it('takes h5 as a heading and leaves h6 a paragraph, as the cms does', async () => {
    const json = await markdownToLexical('##### Five\n\n###### Six');
    const root = json['root'] as { children: { type: string }[] };
    expect(root.children.map((c) => c.type)).toEqual(['heading', 'paragraph']);
  });
});
