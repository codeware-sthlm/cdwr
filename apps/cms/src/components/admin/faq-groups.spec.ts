import { isFaqTopic } from '@codeware/app-cms/util/definitions';

import { groupFaqByTopic } from './faq-groups';
import { OPEN_HELP_EVENT, openHelp } from './help-events';

describe('groupFaqByTopic', () => {
  it('groups by topic in FAQ_TOPICS order and keeps order within a group', () => {
    const groups = groupFaqByTopic([
      { id: 1, topic: 'media' },
      { id: 2, topic: 'pages' },
      { id: 3, topic: 'media' },
      { id: 4, topic: 'drafts' }
    ]);

    expect(groups.map((g) => g.topic.value)).toEqual([
      'pages',
      'drafts',
      'media'
    ]);
    expect(groups[2].entries.map((e) => e.id)).toEqual([1, 3]);
  });

  it('skips topics without entries and unknown topics', () => {
    const groups = groupFaqByTopic([
      { id: 1, topic: 'forms' },
      { id: 2, topic: 'nope' },
      { id: 3 }
    ]);

    expect(groups.map((g) => g.topic.value)).toEqual(['forms']);
    expect(groupFaqByTopic([])).toEqual([]);
  });
});

describe('isFaqTopic', () => {
  it('rejects unknown topics', () => {
    expect(isFaqTopic('drafts')).toBe(true);
    expect(isFaqTopic('nope')).toBe(false);
    expect(isFaqTopic(undefined)).toBe(false);
  });
});

describe('openHelp', () => {
  it('dispatches the event with the topic as detail', () => {
    const listener = jest.fn();
    window.addEventListener(OPEN_HELP_EVENT, listener);
    openHelp('drafts');
    openHelp();
    window.removeEventListener(OPEN_HELP_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0][0].detail).toEqual({ topic: 'drafts' });
    expect(listener.mock.calls[1][0].detail).toBeNull();
  });
});
