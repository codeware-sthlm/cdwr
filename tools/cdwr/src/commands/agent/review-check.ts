import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { z } from 'zod';

import { defineCommand } from '../../cli/command';
import { CliError } from '../../cli/errors';
import { input } from '../../cli/inputs';

import { hostId } from './host-id';
import { checkReview } from './review-check.logic';

export default defineCommand({
  summary: 'Check a review file and print the reviews row for it',
  description:
    'Reads a review JSON file, checks it against the review schema and prints the reviews row (host, brief, actions, findings, stale, suggestions, cost, model) for the telemetry database; with --json that is the result. On an unreadable file or a schema failure it prints one line, failed: <path>: <message>, and exits 1.',
  danger: 'read',
  history: false,
  inputs: {
    file: input.string({
      prompt: 'Which review file?',
      description: 'The review JSON to check',
      positional: true
    }),
    host: input.string({
      prompt: 'Which host?',
      short: 'H',
      description: 'The host the review ran on; this machine by default',
      optional: true,
      flagOnly: true
    }),
    cost: input.number({
      prompt: 'What did it cost?',
      short: 'c',
      description: 'What the review run cost, in USD',
      optional: true,
      flagOnly: true,
      schema: z.number().nonnegative()
    }),
    model: input.string({
      prompt: 'Which model?',
      short: 'm',
      description: 'The model that wrote the review',
      optional: true,
      flagOnly: true
    })
  },

  async plan(ctx, { file, host, cost, model }) {
    const text = await readFile(resolve(ctx.root, file), 'utf8').catch(
      (error: NodeJS.ErrnoException) => {
        throw new CliError(`failed: ${file}: ${error.message}`);
      }
    );
    const checked = checkReview(text, { host: host ?? hostId(), cost, model });
    if (!checked.ok) throw new CliError(checked.message);
    return { steps: [], data: checked.row };
  },

  async apply(_ctx, row) {
    return {
      summary: `${row.findings.length} findings, ${row.actions.length} actions`,
      json: row
    };
  }
});
