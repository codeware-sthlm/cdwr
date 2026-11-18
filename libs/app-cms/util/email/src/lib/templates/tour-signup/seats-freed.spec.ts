import { describe, expect, it } from 'vitest';

import { renderSeatsFreedMail } from './seats-freed';

const base = {
  locale: 'en' as const,
  tourTitle: 'Barolo & Barbaresco Harvest',
  seatsFree: 2,
  firstInQueue: 'Karl Sundström',
  firstInQueuePeople: 4,
  tourUrl: 'https://tours.example.com/admin/collections/tours/21',
  from: 'Titan Tours'
};

describe('renderSeatsFreedMail', () => {
  it('names the seats, the person and what to do', () => {
    const mail = renderSeatsFreedMail(base);

    expect(mail.subject).toBe('Places are free on Barolo & Barbaresco Harvest');
    expect(mail.text).toContain('2 places are free');
    expect(mail.text).toContain('Karl Sundström is first in the waiting list');
    // The point of the mail: nothing fills these seats on its own
    expect(mail.text).toContain('only fills again when you move someone up');
  });

  it('links straight at the tour so the guide can act', () => {
    expect(renderSeatsFreedMail(base).text).toContain(
      'https://tours.example.com/admin/collections/tours/21'
    );
  });

  it('holds together without a link', () => {
    const mail = renderSeatsFreedMail({ ...base, tourUrl: null });

    expect(mail.text).toContain('2 places are free');
    expect(mail.html).not.toContain('href');
  });

  it('translates the whole mail', () => {
    const mail = renderSeatsFreedMail({ ...base, locale: 'sv' });

    expect(mail.subject).toContain('Lediga platser');
    expect(mail.text).toContain('står först på väntelistan');
  });
});
