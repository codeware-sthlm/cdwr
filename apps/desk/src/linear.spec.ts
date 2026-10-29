import { describe, expect, it, vi } from 'vitest';

import { LinearError, type LinearErrorCode, createLinear } from './linear';

const NOW = new Date('2026-10-28T12:00:00.000Z');

const node = (over: Record<string, unknown> = {}) => ({
  identifier: 'COD-1',
  title: 'First',
  priority: 2,
  url: 'https://linear.app/codeware/issue/COD-1',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  state: { name: 'Todo', type: 'unstarted' },
  labels: { nodes: [{ name: 'agent:ready' }, { name: 'Bug' }] },
  ...over
});

const page = (
  nodes: unknown[],
  pageInfo = { hasNextPage: false, endCursor: null as string | null }
) => ({ data: { issues: { nodes, pageInfo } } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

type Sent = {
  url: string;
  init: RequestInit;
  body: { query: string; variables: Record<string, unknown> };
};

const setup = (...responses: (Response | Error)[]) => {
  const queue = [...responses];
  const sent: Sent[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    sent.push({ url, init, body: JSON.parse(String(init.body)) });
    const next = queue.shift();
    if (next === undefined) throw new Error('no response queued');
    if (next instanceof Error) throw next;
    return next;
  });
  const linear = createLinear({ key: 'lin_api_x', fetch, now: () => NOW });
  return { linear, sent, fetch };
};

describe('request', () => {
  it('posts to the GraphQL endpoint with the key as is', async () => {
    const { linear, sent } = setup(json(page([])));
    await linear.listOpen();
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('https://api.linear.app/graphql');
    expect(sent[0].init.method).toBe('POST');
    expect(sent[0].init.headers).toEqual({
      Authorization: 'lin_api_x',
      'Content-Type': 'application/json'
    });
  });

  it('listOpen filters on team and the four open state types', async () => {
    const { linear, sent } = setup(json(page([])));
    await linear.listOpen();
    expect(sent[0].body.variables).toEqual({
      filter: {
        team: { name: { eq: 'Codeware' } },
        state: { type: { in: ['triage', 'backlog', 'unstarted', 'started'] } }
      },
      first: 100,
      after: null
    });
  });

  it('listIdeas filters on the label and a 60 day updatedAt window', async () => {
    const { linear, sent } = setup(json(page([])));
    await linear.listIdeas();
    expect(sent[0].body.variables.filter).toEqual({
      team: { name: { eq: 'Codeware' } },
      labels: { name: { eq: 'agent-idea' } },
      updatedAt: { gt: '2026-08-29T12:00:00.000Z' }
    });
  });

  it('listClosed filters on completed and a 30 day updatedAt window', async () => {
    const { linear, sent } = setup(json(page([])));
    await linear.listClosed();
    expect(sent[0].body.variables.filter).toEqual({
      team: { name: { eq: 'Codeware' } },
      state: { type: { eq: 'completed' } },
      updatedAt: { gt: '2026-09-28T12:00:00.000Z' }
    });
  });

  it('getIssue and listComments pass the identifier', async () => {
    const detail = {
      data: {
        issue: {
          description: null,
          inverseRelations: { nodes: [] },
          attachments: { nodes: [] }
        }
      }
    };
    const comments = { data: { issue: { comments: { nodes: [] } } } };
    const { linear, sent } = setup(json(detail), json(comments));
    await linear.getIssue('COD-7');
    await linear.listComments('COD-7');
    expect(sent.map((s) => s.body.variables)).toEqual([
      { id: 'COD-7' },
      { id: 'COD-7' }
    ]);
  });

  it('viewer returns id and name', async () => {
    const { linear } = setup(
      json({ data: { viewer: { id: 'u1', name: 'Håkan', email: 'x' } } })
    );
    expect(await linear.viewer()).toEqual({ id: 'u1', name: 'Håkan' });
  });
});

describe('pagination', () => {
  it('follows endCursor across two pages and merges the issues', async () => {
    const { linear, sent } = setup(
      json(
        page([node({ identifier: 'COD-1' })], {
          hasNextPage: true,
          endCursor: 'cur-1'
        })
      ),
      json(
        page([node({ identifier: 'COD-2' })], {
          hasNextPage: false,
          endCursor: 'cur-2'
        })
      )
    );
    const buckets = await linear.listOpen();
    expect(sent.map((s) => s.body.variables.after)).toEqual([null, 'cur-1']);
    expect(buckets.unstarted.map((i) => i.id)).toEqual(['COD-1', 'COD-2']);
  });
});

describe('issue mapping', () => {
  it('maps a node to the shape the page reads', async () => {
    const { linear } = setup(
      json(page([node({ completedAt: '2026-10-02T00:00:00.000Z' })]))
    );
    const { unstarted } = await linear.listOpen();
    expect(unstarted).toEqual([
      {
        id: 'COD-1',
        title: 'First',
        priority: { value: 2 },
        status: 'Todo',
        statusType: 'unstarted',
        labels: ['agent:ready', 'Bug'],
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        url: 'https://linear.app/codeware/issue/COD-1',
        completedAt: '2026-10-02T00:00:00.000Z',
        canceledAt: null
      }
    ]);
  });

  it.each([
    ['absent', {}],
    ['null', { completedAt: null, canceledAt: null }]
  ])('a %s completedAt and canceledAt become null', async (_, over) => {
    const { linear } = setup(json(page([node(over)])));
    const [issue] = await linear.listClosed();
    expect(issue.completedAt).toBeNull();
    expect(issue.canceledAt).toBeNull();
  });

  it('groups by statusType with every bucket present', async () => {
    const at = (identifier: string, type: string) =>
      node({ identifier, state: { name: type, type } });
    const { linear } = setup(
      json(
        page([
          at('COD-1', 'started'),
          at('COD-2', 'triage'),
          at('COD-3', 'started')
        ])
      )
    );
    const buckets = await linear.listOpen();
    expect(Object.keys(buckets).sort()).toEqual([
      'backlog',
      'started',
      'triage',
      'unstarted'
    ]);
    expect(buckets.started.map((i) => i.id)).toEqual(['COD-1', 'COD-3']);
    expect(buckets.triage.map((i) => i.id)).toEqual(['COD-2']);
    expect(buckets.backlog).toEqual([]);
  });
});

describe('getIssue', () => {
  it('takes blockedBy from inverse relations of type blocks only', async () => {
    const rel = (type: string, identifier: string) => ({
      type,
      issue: { identifier }
    });
    const { linear } = setup(
      json({
        data: {
          issue: {
            description: 'Body',
            inverseRelations: {
              nodes: [
                rel('blocks', 'COD-1'),
                rel('related', 'COD-2'),
                rel('duplicate', 'COD-3'),
                rel('blocks', 'COD-4')
              ]
            },
            attachments: { nodes: [{ url: 'https://github.com/o/r/pull/9' }] }
          }
        }
      })
    );
    expect(await linear.getIssue('COD-9')).toEqual({
      description: 'Body',
      relations: { blockedBy: [{ id: 'COD-1' }, { id: 'COD-4' }] },
      attachments: [{ url: 'https://github.com/o/r/pull/9' }]
    });
  });

  it('turns a null description into an empty string', async () => {
    const { linear } = setup(
      json({
        data: {
          issue: {
            description: null,
            inverseRelations: { nodes: [] },
            attachments: { nodes: [] }
          }
        }
      })
    );
    expect((await linear.getIssue('COD-9')).description).toBe('');
  });
});

describe('getIssueSummary', () => {
  it('queries by id and maps the node', async () => {
    const { linear, sent } = setup(json({ data: { issue: node() } }));
    const issue = await linear.getIssueSummary('uuid-1');
    expect(sent[0].body.variables).toEqual({ id: 'uuid-1' });
    expect(issue).toMatchObject({
      id: 'COD-1',
      statusType: 'unstarted',
      labels: ['agent:ready', 'Bug']
    });
  });

  it('returns null when the issue is null', async () => {
    const { linear } = setup(json({ data: { issue: null } }));
    expect(await linear.getIssueSummary('COD-9')).toBeNull();
  });

  it.each([
    ['archived', { archivedAt: '2026-10-28T12:00:00.000Z' }],
    ['trashed', { trashed: true }]
  ])('returns null for an %s issue', async (_name, extra) => {
    const { linear } = setup(
      json({ data: { issue: { ...node(), ...extra } } })
    );
    expect(await linear.getIssueSummary('uuid-1')).toBeNull();
  });

  it('returns null on an entity-not-found error', async () => {
    const { linear } = setup(
      json({
        errors: [
          {
            message: 'Entity not found: Issue',
            extensions: { code: 'INPUT_ERROR' }
          }
        ]
      })
    );
    expect(await linear.getIssueSummary('COD-9')).toBeNull();
  });

  it('throws other failures', async () => {
    const { linear } = setup(
      json({ errors: [{ message: 'boom', extensions: { code: 'X' } }] }),
      json({}, 401)
    );
    await expect(linear.getIssueSummary('COD-9')).rejects.toMatchObject({
      code: 'tool_error'
    });
    await expect(linear.getIssueSummary('COD-9')).rejects.toMatchObject({
      code: 'unauthorized'
    });
  });
});

describe('listComments', () => {
  it('orders by createdAt ascending', async () => {
    const { linear } = setup(
      json({
        data: {
          issue: {
            comments: {
              nodes: [
                { body: 'c', createdAt: '2026-10-03T00:00:00.000Z' },
                { body: 'a', createdAt: '2026-10-01T00:00:00.000Z' },
                { body: 'b', createdAt: '2026-10-02T00:00:00.000Z' }
              ]
            }
          }
        }
      })
    );
    const { comments } = await linear.listComments('COD-1');
    expect(comments.map((c) => c.body)).toEqual(['a', 'b', 'c']);
  });
});

describe('errors', () => {
  const gql = (code: string) =>
    json({ errors: [{ message: `boom ${code}`, extensions: { code } }] });

  const cases: [string, () => Response | Error, LinearErrorCode][] = [
    ['HTTP 401', () => json({}, 401), 'unauthorized'],
    [
      'GraphQL AUTHENTICATION_ERROR',
      () => gql('AUTHENTICATION_ERROR'),
      'unauthorized'
    ],
    ['HTTP 429', () => json({}, 429), 'rate_limited'],
    ['GraphQL RATELIMITED', () => gql('RATELIMITED'), 'rate_limited'],
    ['a rejected fetch', () => new TypeError('offline'), 'network'],
    ['other GraphQL errors', () => gql('INVALID_INPUT'), 'tool_error'],
    [
      'a GraphQL error without extensions',
      () => json({ errors: [{ message: 'x' }] }),
      'tool_error'
    ],
    [
      'data failing validation',
      () => json({ data: { issues: { nodes: 'no' } } }),
      'bad_response'
    ],
    ['missing data', () => json({}), 'bad_response'],
    [
      'a non-JSON body',
      () => new Response('<html>', { status: 502 }),
      'bad_response'
    ]
  ];

  it.each(cases)('%s throws %s', async (_, respond, code) => {
    const { linear } = setup(respond());
    const error = await linear.listOpen().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LinearError);
    expect(error).toMatchObject({ code });
    expect(error).toHaveProperty('message', expect.stringMatching(/\S/));
  });
});
