import type { FaqDefinition } from '@codeware/shared/util/seed';
import type { Payload } from 'payload';
import { describe, expect, it } from 'vitest';

import { ensureFaq } from './ensure-faq';

const entry: FaqDefinition = {
  topic: 'drafts',
  question: { en: 'What is a draft?', sv: 'Vad är ett utkast?' },
  answer: { en: 'A saved version.', sv: 'En sparad version.' }
};

/** A stored entry as `findByID` with `locale: 'all'` returns it */
const stored = (
  overrides: Partial<{
    topic: string;
    question: Partial<Record<'en' | 'sv', string>>;
    answer: Partial<Record<'en' | 'sv', string>>;
  }> = {}
) => ({
  id: 7,
  topic: entry.topic,
  question: { ...entry.question },
  answer: { ...entry.answer },
  ...overrides
});

const payloadWith = (existing?: ReturnType<typeof stored>) => {
  const created: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const payload = {
    find: async () =>
      existing
        ? { totalDocs: 1, docs: [{ id: existing.id }] }
        : { totalDocs: 0, docs: [] },
    findByID: async () => existing,
    create: async (args: Record<string, unknown>) => {
      created.push(args);
      return { id: 8 };
    },
    update: async (args: Record<string, unknown>) => {
      updated.push(args);
      return args;
    }
  } as unknown as Payload;
  return { payload, created, updated };
};

describe('ensureFaq', () => {
  it('creates a missing entry in English with its topic, then adds Swedish', async () => {
    const { payload, created, updated } = payloadWith();

    const result = await ensureFaq(payload, entry, { transactionID: 't1' });

    expect(result).toEqual({ id: 8, action: 'created' });
    expect(created[0]).toMatchObject({
      collection: 'faq',
      locale: 'en',
      data: { topic: 'drafts', question: 'What is a draft?' },
      req: { transactionID: 't1' }
    });
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      id: 8,
      locale: 'sv',
      data: { question: 'Vad är ett utkast?', answer: 'En sparad version.' }
    });
  });

  it('writes nothing when the entry already matches', async () => {
    const { payload, created, updated } = payloadWith(stored());

    const result = await ensureFaq(payload, entry, { transactionID: 't1' });

    expect(result).toEqual({ id: 7, action: 'existed' });
    expect(created).toEqual([]);
    expect(updated).toEqual([]);
  });

  it('updates the English locale when the topic differs', async () => {
    const { payload, updated } = payloadWith(stored({ topic: 'search-help' }));

    const result = await ensureFaq(payload, entry, { transactionID: 't1' });

    expect(result).toEqual({ id: 7, action: 'updated' });
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      id: 7,
      locale: 'en',
      data: { topic: 'drafts', answer: 'A saved version.' }
    });
  });

  it('updates only the Swedish locale when only Swedish differs', async () => {
    const { payload, updated } = payloadWith(
      stored({ answer: { en: entry.answer.en, sv: 'Ändrad i admin.' } })
    );

    const result = await ensureFaq(payload, entry, { transactionID: 't1' });

    expect(result).toEqual({ id: 7, action: 'updated' });
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ locale: 'sv' });
  });

  it('adds a missing Swedish translation', async () => {
    const { payload, updated } = payloadWith(
      stored({
        question: { en: entry.question.en },
        answer: { en: entry.answer.en }
      })
    );

    const result = await ensureFaq(payload, entry, { transactionID: 't1' });

    expect(result.action).toBe('updated');
    expect(updated[0]).toMatchObject({
      locale: 'sv',
      data: { question: 'Vad är ett utkast?' }
    });
  });
});
