import type { FaqDefinition } from '@codeware/shared/util/seed';
import type { Payload } from 'payload';

export type EnsureFaqResult = {
  id: number;
  /** `existed` means the entry already matched and nothing was written */
  action: 'created' | 'updated' | 'existed';
};

type Localized = { en: string; sv: string };

/** A localized field read with `locale: 'all'`, or nothing when it is not that shape */
const localized = (value: unknown): Partial<Localized> => {
  if (typeof value !== 'object' || value === null) return {};
  const en =
    'en' in value && typeof value.en === 'string' ? value.en : undefined;
  const sv =
    'sv' in value && typeof value.sv === 'string' ? value.sv : undefined;
  return { en, sv };
};

/**
 * Ensure that a FAQ entry with the given English question exists and holds
 * the given topic, question and answer in both locales.
 *
 * Matched on the English question. A new entry is created with English
 * content and updated with the Swedish translation. An existing one is
 * compared first and written only where it differs, so applying the same
 * entries again writes nothing. Never deletes, and never touches `_order`.
 *
 * @param payload - Payload instance
 * @param data - FAQ data
 * @param options - The transaction to run in
 * @returns The entry's id and whether it was created, updated or left as it was
 */
export async function ensureFaq(
  payload: Payload,
  data: FaqDefinition,
  options: { transactionID: string | number | undefined }
): Promise<EnsureFaqResult> {
  const { transactionID } = options;
  const { answer, question, topic } = data;

  // `question` is localized, so the lookup must run in the same locale the
  // entry is created with, regardless of the configured default locale.
  const faqs = await payload.find({
    collection: 'faq',
    where: { question: { equals: question.en } },
    locale: 'en',
    depth: 0,
    limit: 1,
    req: { transactionID }
  });

  if (!faqs.totalDocs) {
    const faq = await payload.create({
      collection: 'faq',
      data: { topic, answer: answer.en, question: question.en },
      locale: 'en',
      req: { transactionID }
    });

    await payload.update({
      collection: 'faq',
      id: faq.id,
      data: { answer: answer.sv, question: question.sv },
      locale: 'sv',
      req: { transactionID }
    });

    return { id: faq.id, action: 'created' };
  }

  const { id } = faqs.docs[0];
  const current = await payload.findByID({
    collection: 'faq',
    id,
    locale: 'all',
    fallbackLocale: false,
    depth: 0,
    req: { transactionID }
  });
  const currentQuestion = localized(current.question);
  const currentAnswer = localized(current.answer);

  let action: EnsureFaqResult['action'] = 'existed';

  if (current.topic !== topic || currentAnswer.en !== answer.en) {
    await payload.update({
      collection: 'faq',
      id,
      data: { topic, answer: answer.en, question: question.en },
      locale: 'en',
      req: { transactionID }
    });
    action = 'updated';
  }

  if (currentQuestion.sv !== question.sv || currentAnswer.sv !== answer.sv) {
    await payload.update({
      collection: 'faq',
      id,
      data: { answer: answer.sv, question: question.sv },
      locale: 'sv',
      req: { transactionID }
    });
    action = 'updated';
  }

  return { id, action };
}
