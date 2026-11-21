import { FAQ_TOPICS, isFaqTopic } from '@codeware/app-cms/util/definitions';
import { platform } from '@codeware/shared/util/seed';
import { describe, expect, it } from 'vitest';

/**
 * The platform FAQ in `faq.ts` reaches production at every host boot, so
 * what the help drawer needs is checked here, against the topics the
 * collection and the drawer read
 */
describe('platform FAQ', () => {
  const { faq } = platform;

  it('gives every entry a known topic', () => {
    expect(faq.filter(({ topic }) => !isFaqTopic(topic))).toEqual([]);
  });

  it('states every entry in both languages', () => {
    const incomplete = faq.filter(
      ({ question, answer }) =>
        ![question.en, question.sv, answer.en, answer.sv].every(
          (text) => text.trim().length > 0
        )
    );

    expect(incomplete).toEqual([]);
  });

  it('has at least one entry under every topic', () => {
    const empty = FAQ_TOPICS.map(({ value }) => value).filter(
      (topic) => !faq.some((entry) => entry.topic === topic)
    );

    expect(empty).toEqual([]);
  });

  it('never repeats an English question, which the apply matches on', () => {
    const questions = faq.map(({ question }) => question.en);

    expect(new Set(questions).size).toBe(questions.length);
  });
});
