import { describe, expect, it } from 'vitest';

import { model } from '../model';
import type { DeskState } from '../state';

import { NOW, filled, issue, runs, view } from './fixtures';
import { SEARCH_MAX, searchTickets } from './search';

const searched = (state: DeskState, query: string) =>
  searchTickets(model(state, NOW, null), state, query);

const ids = (state: DeskState, query: string): string[] =>
  searched(state, query).map((h) => h.ticket);

/** The filled desk with tickets around 79 and a root with a child in the queue's tree */
const desk = (): DeskState => {
  const s = filled();
  s.data.buckets.set('started', [
    issue('COD-79', { title: 'Fix login' }),
    issue('COD-790', { title: 'Unrelated' }),
    issue('COD-797', { title: 'Search the desk' }),
    issue('COD-798', { title: 'Login page' })
  ]);
  s.data.runs = runs(
    view({
      session: { state: 'alive', ticket: 'COD-1', id: 's1' },
      audit: [
        {
          id: 'g1',
          ticket: 'COD-800',
          title: 'A gapped ticket',
          kind: 'k',
          what: 'w',
          fix: 'f'
        }
      ],
      tree: [
        {
          ticket: 'COD-801',
          title: 'Root of trees',
          state: 'started',
          label: null,
          pr: null,
          blockers: [],
          gaps: [],
          children: [
            {
              ticket: 'COD-802',
              title: 'Leaf of trees',
              state: 'unstarted',
              label: null,
              pr: null,
              blockers: [],
              gaps: [],
              children: []
            }
          ]
        }
      ]
    })
  );
  return s;
};

describe('searchTickets', () => {
  it.each([
    ['797', 'COD-797'],
    ['cod-797', 'COD-797'],
    ['COD-797', 'COD-797'],
    [' 797 ', 'COD-797']
  ])('finds %s as the exact id first', (query, ticket) => {
    expect(ids(desk(), query)[0]).toBe(ticket);
  });

  it.each([
    ['79', ['COD-79', 'COD-798', 'COD-797', 'COD-790']],
    ['cod-79', ['COD-79', 'COD-798', 'COD-797', 'COD-790']],
    ['80', ['COD-802', 'COD-801', 'COD-800']]
  ])(
    'ranks the id prefix %s after the exact id, higher number first',
    (query, expected) => {
      expect(ids(desk(), query)).toEqual(expected);
    }
  );

  it.each([
    ['login', ['COD-798', 'COD-79']],
    ['LOGIN PAGE', ['COD-798']],
    ['fix  login', ['COD-79']],
    ['page login', ['COD-798']],
    ['zzz', []]
  ])('matches every word of %s in the title, any case', (query, expected) => {
    expect(ids(desk(), query)).toEqual(expected);
  });

  it('puts exact id before prefix before title matches', () => {
    const s = desk();
    s.data.buckets.set('backlog', [issue('COD-5', { title: 'About 79' })]);
    expect(ids(s, '79').slice(0, 5)).toEqual([
      'COD-79',
      'COD-798',
      'COD-797',
      'COD-790',
      'COD-5'
    ]);
  });

  it.each([[''], ['   ']])('finds nothing for the empty query %j', (query) => {
    expect(searched(desk(), query)).toEqual([]);
  });

  it('lists each ticket once with the places it shows up in order', () => {
    const hits = searched(desk(), 'cod-1');
    expect(hits.filter((h) => h.ticket === 'COD-1')).toHaveLength(1);
    expect(hits[0]).toEqual({
      ticket: 'COD-1',
      title: 'Title of COD-1',
      where: ['open', 'next', 'session']
    });
  });

  it.each([
    ['30', ['closed']],
    ['50', ['idea']],
    ['801', ['tree']],
    ['802', ['tree']],
    ['800', ['gap']],
    ['2', ['open', 'parked']],
    ['3', ['open', 'review']],
    ['4', ['open', 'plan']],
    ['5', ['hand-offs']],
    ['6', ['label']]
  ])('names where COD-%s shows up', (n, where) => {
    expect(searched(desk(), n)[0]).toMatchObject({
      ticket: `COD-${n}`,
      where
    });
  });

  it('finds a question and an approved plan held by an open blocker', () => {
    const s = desk();
    s.data.runs = runs(
      view({
        table: {
          before: [{ ticket: 'COD-700', kind: 'question' }],
          label: [],
          after: []
        },
        blocked: [{ ticket: 'COD-701', blockers: ['COD-702'] }]
      })
    );
    expect(searched(s, '700')[0]).toMatchObject({ where: ['question'] });
    expect(searched(s, '701')[0]).toMatchObject({ where: ['held'] });
  });

  it('takes the title from the Linear issue, else the tree, else the gap', () => {
    const s = desk();
    expect(searched(s, '802')[0].title).toBe('Leaf of trees');
    expect(searched(s, '800')[0].title).toBe('A gapped ticket');
    expect(searched(s, '797')[0].title).toBe('Search the desk');
    expect(searched(s, '6')[0].title).toBe('');
  });

  it('returns at most SEARCH_MAX hits', () => {
    const s = desk();
    s.data.buckets.set(
      'backlog',
      Array.from({ length: SEARCH_MAX + 5 }, (_, i) =>
        issue(`COD-${100 + i}`, { title: 'bulk work' })
      )
    );
    const hits = searched(s, 'bulk');
    expect(hits).toHaveLength(SEARCH_MAX);
    expect(hits[0].ticket).toBe(`COD-${100 + SEARCH_MAX + 4}`);
  });
});
