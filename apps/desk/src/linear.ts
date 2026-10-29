import { z } from 'zod';

const ENDPOINT = 'https://api.linear.app/graphql';
const TEAM = 'Codeware';
export const OPEN_STATES = [
  'triage',
  'backlog',
  'unstarted',
  'started'
] as const;
export const IDEA_LABEL = 'agent-idea';
export const IDEA_WINDOW_DAYS = 60;
export const CLOSED_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type LinearErrorCode =
  'unauthorized' | 'rate_limited' | 'network' | 'bad_response' | 'tool_error';

export class LinearError extends Error {
  readonly code: LinearErrorCode;

  constructor(code: LinearErrorCode, message: string) {
    super(message);
    this.name = 'LinearError';
    this.code = code;
  }
}

const statusTypeSchema = z.enum([
  'triage',
  'backlog',
  'unstarted',
  'started',
  'completed',
  'canceled'
]);

const issueNodeSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  priority: z.number().int().min(0).max(4),
  url: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullish(),
  canceledAt: z.string().nullish(),
  state: z.object({ name: z.string(), type: statusTypeSchema }),
  labels: z.object({ nodes: z.array(z.object({ name: z.string() })) })
});

const issuePageSchema = z.object({
  issues: z.object({
    nodes: z.array(issueNodeSchema),
    pageInfo: z.object({
      hasNextPage: z.boolean(),
      endCursor: z.string().nullable()
    })
  })
});

const issueSummarySchema = z.object({
  issue: issueNodeSchema
    .extend({
      archivedAt: z.string().nullish(),
      trashed: z.boolean().nullish()
    })
    .nullable()
});

const issueDetailSchema = z.object({
  issue: z.object({
    description: z.string().nullable(),
    inverseRelations: z.object({
      nodes: z.array(
        z.object({
          type: z.string(),
          issue: z.object({ identifier: z.string() })
        })
      )
    }),
    attachments: z.object({ nodes: z.array(z.object({ url: z.string() })) })
  })
});

const commentsSchema = z.object({
  issue: z.object({
    comments: z.object({
      nodes: z.array(z.object({ body: z.string(), createdAt: z.string() }))
    })
  })
});

const viewerSchema = z.object({
  viewer: z.object({ id: z.string(), name: z.string() })
});

const envelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        extensions: z
          .object({ code: z.string().optional() })
          .passthrough()
          .optional()
      })
    )
    .optional()
});

export type StatusType = z.infer<typeof statusTypeSchema>;
export type OpenStatusType = (typeof OPEN_STATES)[number];

export type Issue = {
  id: string;
  title: string;
  priority: { value: number };
  status: string;
  statusType: StatusType;
  labels: string[];
  createdAt: string;
  url: string;
  completedAt: string | null;
  canceledAt: string | null;
};

export type IssueDetail = {
  description: string;
  relations: { blockedBy: { id: string }[] };
  attachments: { url: string }[];
};

export type Comment = { body: string; createdAt: string };

export type Viewer = { id: string; name: string };

/** WHATWG fetch signature; the app passes the Tauri HTTP plugin's. */
export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export type LinearOptions = {
  key: string;
  fetch: Fetch;
  /** Clock for the idea and closed windows. */
  now?: () => Date;
};

const ISSUE_FIELDS = `
  identifier
  title
  priority
  url
  createdAt
  completedAt
  canceledAt
  state { name type }
  labels(first: 20) { nodes { name } }
`;

// Linear prices a query by its connections and assumes 50 nodes for any without
// `first`, so unbounded nested ones multiply with the page size and get the
// request rejected over the 10,000 point limit. Every nested connection is capped.
const ISSUES_QUERY = `
  query Issues($filter: IssueFilter, $first: Int, $after: String) {
    issues(filter: $filter, first: $first, after: $after) {
      nodes { ${ISSUE_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const ISSUE_QUERY = `
  query Issue($id: String!) {
    issue(id: $id) {
      description
      inverseRelations(first: 50) { nodes { type issue { identifier } } }
      attachments(first: 20) { nodes { url } }
    }
  }
`;

const SUMMARY_QUERY = `
  query IssueSummary($id: String!) {
    issue(id: $id) { ${ISSUE_FIELDS} archivedAt trashed }
  }
`;

const COMMENTS_QUERY = `
  query Comments($id: String!) {
    issue(id: $id) {
      comments(first: 100) { nodes { body createdAt } }
    }
  }
`;

const VIEWER_QUERY = `query Viewer { viewer { id name } }`;

const toIssue = (node: z.infer<typeof issueNodeSchema>): Issue => ({
  id: node.identifier,
  title: node.title,
  priority: { value: node.priority },
  status: node.state.name,
  statusType: node.state.type,
  labels: node.labels.nodes.map((l) => l.name),
  createdAt: node.createdAt,
  url: node.url,
  completedAt: node.completedAt ?? null,
  canceledAt: node.canceledAt ?? null
});

const byCreatedAt = (a: Comment, b: Comment) =>
  a.createdAt.localeCompare(b.createdAt);

export const createLinear = ({
  key,
  fetch,
  now = () => new Date()
}: LinearOptions) => {
  const request = async <T extends z.ZodTypeAny>(
    query: string,
    variables: Record<string, unknown>,
    schema: T
  ): Promise<z.infer<T>> => {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
      });
    } catch (e) {
      throw new LinearError(
        'network',
        e instanceof Error ? e.message : 'The request failed'
      );
    }

    if (res.status === 401) {
      throw new LinearError('unauthorized', 'Linear rejected the API key');
    }
    if (res.status === 429) {
      throw new LinearError('rate_limited', 'Linear rate limit reached');
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new LinearError(
        'bad_response',
        `Linear answered ${res.status} without JSON`
      );
    }

    const envelope = envelopeSchema.safeParse(json);
    if (!envelope.success) {
      throw new LinearError('bad_response', 'Unexpected response from Linear');
    }

    const { errors, data } = envelope.data;
    if (errors && errors.length > 0) {
      const codes = errors.map((e) => e.extensions?.code);
      const message = errors.map((e) => e.message).join('; ');
      if (codes.includes('AUTHENTICATION_ERROR')) {
        throw new LinearError('unauthorized', message);
      }
      if (codes.includes('RATELIMITED')) {
        throw new LinearError('rate_limited', message);
      }
      throw new LinearError('tool_error', message);
    }

    if (!res.ok) {
      throw new LinearError('bad_response', `Linear answered ${res.status}`);
    }

    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new LinearError('bad_response', 'Unexpected response from Linear');
    }
    return parsed.data;
  };

  const fetchIssues = async (filter: Record<string, unknown>) => {
    const issues: Issue[] = [];
    let after: string | null = null;
    for (;;) {
      const page: z.infer<typeof issuePageSchema> = await request(
        ISSUES_QUERY,
        { filter, first: 100, after },
        issuePageSchema
      );
      issues.push(...page.issues.nodes.map(toIssue));
      const { hasNextPage, endCursor } = page.issues.pageInfo;
      if (!hasNextPage || endCursor === null) return issues;
      after = endCursor;
    }
  };

  const teamFilter = { team: { name: { eq: TEAM } } };
  const since = (days: number) =>
    new Date(now().getTime() - days * DAY_MS).toISOString();

  return {
    /** Open issues of the team, grouped by state type. */
    async listOpen(): Promise<Record<OpenStatusType, Issue[]>> {
      const issues = await fetchIssues({
        ...teamFilter,
        state: { type: { in: [...OPEN_STATES] } }
      });
      const buckets: Record<OpenStatusType, Issue[]> = {
        triage: [],
        backlog: [],
        unstarted: [],
        started: []
      };
      for (const issue of issues) {
        const type = issue.statusType;
        if (type !== 'completed' && type !== 'canceled') {
          buckets[type].push(issue);
        }
      }
      return buckets;
    },

    /** Ideas touched within the idea window, in any state. */
    listIdeas(): Promise<Issue[]> {
      return fetchIssues({
        ...teamFilter,
        labels: { name: { eq: IDEA_LABEL } },
        updatedAt: { gt: since(IDEA_WINDOW_DAYS) }
      });
    },

    /** Issues completed within the closed window. */
    listClosed(): Promise<Issue[]> {
      return fetchIssues({
        ...teamFilter,
        state: { type: { eq: 'completed' } },
        updatedAt: { gt: since(CLOSED_WINDOW_DAYS) }
      });
    },

    /** One issue by UUID or identifier; null when Linear has no such issue. */
    async getIssueSummary(id: string): Promise<Issue | null> {
      try {
        const { issue } = await request(
          SUMMARY_QUERY,
          { id },
          issueSummarySchema
        );
        // Linear still returns an archived or trashed issue, which no list shows
        return issue && !issue.archivedAt && !issue.trashed
          ? toIssue(issue)
          : null;
      } catch (e) {
        if (
          e instanceof LinearError &&
          e.code === 'tool_error' &&
          /not found/i.test(e.message)
        )
          return null;
        throw e;
      }
    },

    async getIssue(identifier: string): Promise<IssueDetail> {
      const { issue } = await request(
        ISSUE_QUERY,
        { id: identifier },
        issueDetailSchema
      );
      return {
        description: issue.description ?? '',
        relations: {
          blockedBy: issue.inverseRelations.nodes
            .filter((r) => r.type === 'blocks')
            .map((r) => ({ id: r.issue.identifier }))
        },
        attachments: issue.attachments.nodes.map((a) => ({ url: a.url }))
      };
    },

    /** Up to 100 comments, oldest first. */
    async listComments(identifier: string): Promise<{ comments: Comment[] }> {
      const { issue } = await request(
        COMMENTS_QUERY,
        { id: identifier },
        commentsSchema
      );
      return { comments: issue.comments.nodes.slice().sort(byCreatedAt) };
    },

    async viewer(): Promise<Viewer> {
      const { viewer } = await request(VIEWER_QUERY, {}, viewerSchema);
      return { id: viewer.id, name: viewer.name };
    }
  };
};

export type Linear = ReturnType<typeof createLinear>;
