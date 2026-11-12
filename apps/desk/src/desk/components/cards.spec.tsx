// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { model } from '../model';
import type { DeskState } from '../state';
import { NOW, at, filled, hostSample, runs, view } from '../view/fixtures';

import { Cards } from './cards';

const cards = (s: DeskState) =>
  render(
    <Cards
      m={model(s, NOW)}
      details={s.details}
      now={NOW}
      snoozedOpen={false}
      onSnoozedOpen={() => undefined}
    />
  ).container;

/** A session that has gone silent with a run open */
const silent = (): DeskState => {
  const s = filled();
  s.data.githubEvents = [
    {
      pr: null,
      subject: 'push',
      action: 'push',
      updated_at: new Date(at(5)).toISOString()
    }
  ];
  s.data.storedAt = at(1);
  s.data.runs = runs(view({ session: { state: 'alive', ticket: 'COD-1' } }));
  s.data.hostMetrics = [hostSample(60), hostSample(50)];
  return s;
};

describe('Cards', () => {
  it('shows the session card above Waiting on you', () => {
    const c = cards(filled());
    const w = Array.from(c.querySelectorAll('article')).map((a) =>
      a.getAttribute('data-w')
    );
    expect(w).toEqual(['session', 'before']);
    expect(c.querySelector('.state-unknown')).toBeNull();
  });

  it('puts the unknown-state card in place of the session card', () => {
    const c = cards(silent());
    expect(c.querySelector('section.state-unknown')).not.toBeNull();
    expect(c.querySelector('[data-w="session"]')).toBeNull();
    expect(c.querySelector('[data-w="before"]')).not.toBeNull();
  });
});
