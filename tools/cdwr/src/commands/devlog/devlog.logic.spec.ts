import {
  accessUrl,
  assertCanDraft,
  authHeader,
  categoryIdFrom,
  categoryUrl,
  createBody,
  createUrl,
  outcomeOf,
  parseCovered,
  parseCovers,
  parseDraft,
  readUrl,
  requestHeaders,
  serializeCovered
} from './devlog.logic';

const DEVICE = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';

const META = 'Meta title: A meta title';
const DESC = `Description: ${'d'.repeat(60)}`;
const draft = (body = 'Body line', head = `${META}\n${DESC}`) =>
  `# T\n${head}\n\n${body}\n`;

describe('parseDraft', () => {
  it('takes the title, the two meta lines and the body', () => {
    expect(
      parseDraft(
        `intro\n#  The title \nMeta title:  A meta \n\n${DESC}\n\nBody line\n\n## Section\nMore\n\n`
      )
    ).toEqual({
      title: 'The title',
      metaTitle: 'A meta',
      metaDescription: 'd'.repeat(60),
      body: 'Body line\n\n## Section\nMore'
    });
  });

  it('copes with CRLF', () => {
    expect(parseDraft(draft('Body').replace(/\n/g, '\r\n'))).toEqual({
      title: 'T',
      metaTitle: 'A meta title',
      metaDescription: 'd'.repeat(60),
      body: 'Body'
    });
  });

  it.each([
    ['no title', 'Just text\n\n## Not a title', /needs a title/],
    ['a "#" without a space', '#Title\nBody', /needs a title/],
    ['an empty title', '# \nBody', /title is empty/],
    ['no meta title', `# T\n${DESC}\nBody`, /needs a "Meta title:" line/],
    [
      'the description first',
      `# T\n${DESC}\n${META}\nBody`,
      /needs a "Meta title:" line/
    ],
    ['no description', `# T\n${META}\nBody`, /needs a "Description:" line/],
    [
      'a body between the meta lines',
      `# T\n${META}\nBody\n${DESC}`,
      /needs a "Description:" line/
    ],
    [
      'an empty meta title',
      `# T\nMeta title:  \n${DESC}\nBody`,
      /meta title is empty/
    ],
    [
      'an empty description',
      `# T\n${META}\nDescription:\nBody`,
      /description is empty/
    ],
    ['no body', draft('  '), /no body/],
    ['a code fence', draft('Body\n```ts\nx\n```'), /code fence/],
    ['a tilde fence', draft('Body\n~~~\nx\n~~~'), /code fence/],
    ['an indented fence', draft('Body\n   ```\nx\n   ```'), /code fence/]
  ])('refuses %s', (_name, text, message) => {
    expect(() => parseDraft(text)).toThrow(message);
  });

  it.each([
    ['meta title of 60', 'Meta title', 60, true],
    ['meta title of 61', 'Meta title', 61, false],
    ['description of 49', 'Description', 49, false],
    ['description of 50', 'Description', 50, true],
    ['description of 160', 'Description', 160, true],
    ['description of 161', 'Description', 161, false]
  ])('checks %s', (_name, label, length, ok) => {
    const meta = label === 'Meta title' ? 'x'.repeat(length) : 'A meta title';
    const desc = label === 'Description' ? 'x'.repeat(length) : 'd'.repeat(60);
    const text = `# T\nMeta title: ${meta}\nDescription: ${desc}\n\nBody`;
    if (ok) expect(() => parseDraft(text)).not.toThrow();
    else expect(() => parseDraft(text)).toThrow(/characters/);
  });
});

describe('parseCovers', () => {
  it.each([
    ['412', [412]],
    ['412,415', [412, 415]],
    [' 415 , 412,415 ', [415, 412]]
  ])('reads %j', (value, expected) => {
    expect(parseCovers(value)).toEqual(expected);
  });

  it.each(['', '0', '-3', '1.5', 'abc', '12,,13', '12,x', '#12'])(
    'refuses %j',
    (value) => {
      expect(() => parseCovers(value)).toThrow(/pull request number/);
    }
  );
});

describe('request building', () => {
  it('uses the agents collection prefix', () => {
    expect(authHeader('k')).toBe('agents API-Key k');
  });

  it('sends no signature without a secret', () => {
    expect(
      requestHeaders({ key: 'k', deviceId: DEVICE, userAgent: 'ua' })
    ).toEqual({
      Authorization: 'agents API-Key k',
      'Content-Type': 'application/json'
    });
  });

  it('adds signature headers with a secret', () => {
    const headers = requestHeaders({
      key: 'k',
      signatureSecret: 'secret',
      deviceId: DEVICE,
      userAgent: 'ua'
    });
    expect(headers['Authorization']).toBe('agents API-Key k');
    expect(headers['X-Device-Id']).toBe(DEVICE);
    expect(headers['X-Signature']).toBeTruthy();
  });

  it('builds urls without doubling the slash', () => {
    expect(createUrl('https://cms.test/')).toBe(
      'https://cms.test/api/posts?draft=true'
    );
    expect(readUrl('https://cms.test', 'a/b 1')).toBe(
      'https://cms.test/api/posts/a%2Fb%201?trash=true'
    );
    expect(readUrl('https://cms.test//', 7)).toBe(
      'https://cms.test/api/posts/7?trash=true'
    );
  });

  it('sends a draft with no tenant or author', () => {
    expect(
      createBody({
        title: 'T',
        content: { root: {} },
        metaTitle: 'M',
        metaDescription: 'D',
        categoryId: 5
      })
    ).toEqual({
      title: 'T',
      content: { root: {} },
      meta: { title: 'M', description: 'D' },
      categories: [5],
      _status: 'draft'
    });
  });

  it('looks the devlog category up by slug', () => {
    const url = categoryUrl('https://cms.test//');
    expect(url).toBe(
      'https://cms.test/api/categories?where%5Bslug%5D%5Bequals%5D=devlog&limit=1&depth=0'
    );
    expect(new URL(url).searchParams.get('where[slug][equals]')).toBe('devlog');
  });
});

describe('categoryIdFrom', () => {
  it('reads the id of the first doc', () => {
    expect(categoryIdFrom(200, { docs: [{ id: 9 }] })).toBe(9);
    expect(categoryIdFrom(200, { docs: [{ id: 'abc' }] })).toBe('abc');
  });

  it('refuses an empty answer', () => {
    expect(() => categoryIdFrom(200, { docs: [] })).toThrow(
      "The cms has no category with the slug devlog in the agent's workspace. Apply the cdwr.io site definition, which seeds it."
    );
  });

  it('refuses anything but 200', () => {
    expect(() => categoryIdFrom(403, { docs: [{ id: 1 }] })).toThrow(
      'The cms answered 403 when reading the devlog category'
    );
  });
});

describe('covered file', () => {
  const rows = [
    { postId: 1, prs: [3, 4], title: 'One', at: '2026-01-01T00:00:00.000Z' },
    {
      postId: 'x',
      prs: [5],
      title: 'Two',
      at: '2026-01-02T00:00:00.000Z',
      outcome: 'published' as const,
      checkedAt: '2026-01-03T00:00:00.000Z'
    }
  ];

  it('round-trips, one line per row', () => {
    const text = serializeCovered(rows);
    expect(text.split('\n')).toHaveLength(3);
    expect(text.endsWith('\n')).toBe(true);
    expect(parseCovered(text)).toEqual(rows);
  });

  it('writes nothing for no rows and skips blank lines', () => {
    expect(serializeCovered([])).toBe('');
    expect(parseCovered('\n  \n')).toEqual([]);
  });

  it('names the bad line', () => {
    expect(() =>
      parseCovered('{"postId":1,"prs":[],"title":"T","at":"x"}\n\nnot json\n')
    ).toThrow('Line 3 of the covered file is not JSON');
  });

  it('names the bad field of a row', () => {
    expect(() => parseCovered('{"postId":1,"title":"T","at":"x"}\n')).toThrow(
      /Line 1 of the covered file is not a covered row: prs/
    );
  });
});

describe('assertCanDraft', () => {
  // Payload sanitizes a granted permission to `true`
  const allowed = { collections: { posts: { create: true } } };

  it('accepts a key that may create posts', () => {
    expect(() => assertCanDraft(200, allowed)).not.toThrow();
  });

  it('accepts the scoped object form too', () => {
    const scoped = { collections: { posts: { create: { permission: true } } } };
    expect(() => assertCanDraft(200, scoped)).not.toThrow();
  });

  it.each([
    [200, { collections: { posts: { create: false } } }],
    [200, { collections: { posts: { create: { permission: false } } } }],
    [200, { collections: { posts: {} } }],
    [200, { collections: {} }],
    [200, null],
    [401, null],
    [403, allowed],
    [500, null]
  ])('refuses %i %j', (status, body) => {
    expect(() => assertCanDraft(status, body)).toThrow('CMS_AGENT_API_KEY');
  });

  it('reads access from /api/access', () => {
    expect(accessUrl('https://cms.test//')).toBe('https://cms.test/api/access');
  });
});

describe('outcomeOf', () => {
  it.each([
    [200, { _status: 'published' }, 'published'],
    [200, { _status: 'draft' }, 'draft'],
    [200, {}, 'draft'],
    [200, { _status: 'draft', deletedAt: '2026-01-01' }, 'deleted'],
    [200, { _status: 'published', deletedAt: '2026-01-01' }, 'deleted'],
    [404, { errors: [] }, 'deleted']
  ])('%i %j is %s', (status, body, expected) => {
    expect(outcomeOf(status, body)).toBe(expected);
  });

  it.each([401, 403, 500, 502])('refuses to decide on %i', (status) => {
    expect(() => outcomeOf(status, {})).toThrow(String(status));
  });
});
