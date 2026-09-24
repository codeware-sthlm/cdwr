import type { Payload } from 'payload';

import { resolveRichText } from './resolve-rich-text';

vi.mock('@codeware/app-cms/util/content-templates', () => ({
  convertMarkdownToLexical: vi.fn(
    async (_config: unknown, markdown: string) => ({
      root: { children: [{ text: markdown }] }
    })
  )
}));

const payload = { config: {} } as unknown as Payload;

describe('resolveRichText', () => {
  it('converts the markdown a column states', async () => {
    const block = await resolveRichText(payload, {
      blockType: 'content',
      columns: [{ size: 'full', richText: { markdown: '## Hi' } }]
    });

    expect(block).toEqual({
      blockType: 'content',
      columns: [
        { size: 'full', richText: { root: { children: [{ text: '## Hi' }] } } }
      ]
    });
  });

  it('leaves a block that is not content alone', async () => {
    const block = { blockType: 'hero', heading: 'Hi' };

    await expect(resolveRichText(payload, block)).resolves.toBe(block);
  });

  it('leaves a column that states no rich text alone', async () => {
    const block = await resolveRichText(payload, {
      blockType: 'content',
      columns: [{ size: 'half' }]
    });

    expect(block).toEqual({
      blockType: 'content',
      columns: [{ size: 'half' }]
    });
  });

  it('converts every column independently', async () => {
    const block = (await resolveRichText(payload, {
      blockType: 'content',
      columns: [
        { richText: { markdown: 'one' } },
        { richText: { markdown: 'two' } }
      ]
    })) as {
      columns: Array<{
        richText: { root: { children: Array<{ text: string }> } };
      }>;
    };

    expect(block.columns.map((c) => c.richText.root.children[0].text)).toEqual([
      'one',
      'two'
    ]);
  });
});
