import {
  FAQ_TOPICS,
  type FaqTopic,
  isFaqTopic
} from '@codeware/app-cms/util/definitions';

export type FaqGroup<T> = {
  topic: (typeof FAQ_TOPICS)[number];
  entries: Array<T>;
};

/**
 * Groups FAQ entries by topic in `FAQ_TOPICS` order. Entries keep their given
 * order within a group; topics without entries (and entries with an unknown
 * topic) are left out.
 */
export function groupFaqByTopic<T extends { topic?: FaqTopic | string | null }>(
  entries: ReadonlyArray<T>
): Array<FaqGroup<T>> {
  return FAQ_TOPICS.map((topic) => ({
    topic,
    entries: entries.filter(
      (entry) => isFaqTopic(entry.topic) && entry.topic === topic.value
    )
  })).filter((group) => group.entries.length > 0);
}
