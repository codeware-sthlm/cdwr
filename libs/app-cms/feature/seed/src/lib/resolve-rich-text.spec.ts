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

  it('converts the intro above a form, which every home page uses', async () => {
    const block = await resolveRichText(payload, {
      blockType: 'form',
      form: { lookupTitle: 'Contact' },
      enableIntro: true,
      introContent: { markdown: '## Reach out' }
    });

    expect(block).toEqual({
      blockType: 'form',
      form: { lookupTitle: 'Contact' },
      enableIntro: true,
      introContent: { root: { children: [{ text: '## Reach out' }] } }
    });
  });

  it('leaves a form that states no intro alone', async () => {
    const block = { blockType: 'form', form: { lookupTitle: 'Contact' } };

    await expect(resolveRichText(payload, block)).resolves.toBe(block);
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
