import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { defineCommand } from '../../cli/command';
import { CliError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { paths } from '../../services/agent-queue';

import { cmsCredentials, coveredPath, deviceIdIn } from './devlog.io';
import {
  type CoveredRow,
  DEVLOG_CATEGORY,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
  categoryIdFrom,
  categoryUrl,
  createBody,
  createUrl,
  parseCovers,
  parseDraft,
  requestHeaders
} from './devlog.logic';
import { markdownToLexical } from './markdown';

interface Data {
  title: string;
  metaTitle: string;
  metaDescription: string;
  prs: number[];
  content: Record<string, unknown>;
  home: string;
}

/** The cms's own words for a refusal; Payload answers `{ errors: [{ message }] }` */
async function errorMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { errors?: Array<{ message?: string }> };
    const messages = parsed.errors?.map((e) => e.message).filter(Boolean);
    if (messages?.length) return messages.join('; ');
  } catch {
    // Not JSON, so the raw text is all there is
  }
  return text.slice(0, 200) || response.statusText;
}

export default defineCommand<
  {
    file: ReturnType<typeof input.string>;
    covers: ReturnType<typeof input.string>;
  },
  Data
>({
  summary: 'Post a devlog draft to the cms as the agent',
  description:
    'Reads a markdown file whose first "# " line is the title, followed by a "Meta title:" line and a "Description:" line, creates one draft post from it in the devlog category as the agent user, and records the pull requests it covers in devlog-covered.jsonl in the agent queue home. The post is never published here. Needs CMS_URL and CMS_AGENT_API_KEY, and CMS_SIGNATURE_SECRET when the cms runs in host mode.',
  danger: 'mutate',
  inputs: {
    file: input.string({
      prompt: 'Which markdown file?',
      short: 'f',
      description:
        'The draft: "# Title", "Meta title: …", "Description: …", then the body'
    }),
    covers: input.string({
      prompt: 'Which pull requests does it cover?',
      short: 'c',
      description: 'Pull request numbers separated by commas',
      placeholder: '412,415'
    })
  },

  async plan(ctx, { file, covers }) {
    const { title, metaTitle, metaDescription, body } = parseDraft(
      await readFile(resolve(file), 'utf8')
    );
    const prs = parseCovers(covers);
    const content = await markdownToLexical(body);
    const cmsUrl = ctx.env['CMS_URL'];

    return {
      steps: [
        {
          label: `Create one draft post '${title}'`,
          detail: cmsUrl ? createUrl(cmsUrl) : undefined
        },
        { label: `Set the meta title '${metaTitle}'` },
        { label: `Set the meta description '${metaDescription}'` },
        {
          label: `Put it in the category ${DEVLOG_CATEGORY}`,
          detail: cmsUrl ? categoryUrl(cmsUrl) : undefined
        },
        {
          label: `Record that it covers ${prs.map((n) => `#${n}`).join(', ')}`
        }
      ],
      data: {
        title,
        metaTitle,
        metaDescription,
        prs,
        content,
        home: paths(ctx.env).home
      }
    };
  },

  async apply(ctx, data) {
    const { cmsUrl, key, signatureSecret } = cmsCredentials(ctx.env);
    const { title, metaTitle, metaDescription, prs, content, home } = data;
    const deviceId = await deviceIdIn(home);
    // Signed per request: a signature's request id is single-use
    const headers = () =>
      requestHeaders({ key, signatureSecret, deviceId, userAgent: USER_AGENT });

    const categoryResponse = await fetch(categoryUrl(cmsUrl), {
      headers: headers(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    let categoryId: string | number;
    try {
      categoryId = categoryIdFrom(
        categoryResponse.status,
        categoryResponse.status === 200
          ? await categoryResponse.json()
          : undefined
      );
    } catch (error) {
      const detail =
        categoryResponse.status === 200
          ? ''
          : `: ${await errorMessage(categoryResponse)}`;
      throw new CliError(
        `${error instanceof Error ? error.message : String(error)}${detail}`
      );
    }

    const response = await fetch(createUrl(cmsUrl), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(
        createBody({ title, content, metaTitle, metaDescription, categoryId })
      ),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (response.status !== 201) {
      throw new CliError(
        `The cms answered ${response.status}: ${await errorMessage(response)}`
      );
    }
    const postId = (
      (await response.json()) as { doc?: { id?: string | number } }
    ).doc?.id;
    if (postId === undefined) {
      throw new CliError('The cms created a post but returned no id');
    }

    const row: CoveredRow = {
      postId,
      prs,
      title,
      at: new Date().toISOString()
    };
    await mkdir(home, { recursive: true });
    await appendFile(coveredPath(home), `${JSON.stringify(row)}\n`);

    return {
      summary: `Drafted ${postId} ${title}`,
      json: { postId, title, prs }
    };
  }
});
