import { defineCommand, readOnly } from '../cli/command';
import { readHistory } from '../cli/history';
import { input } from '../cli/inputs';
import { cdwrHome } from '../cli/prefs';
import { symbols, theme } from '../ui/theme';

export default defineCommand({
  summary: 'What changed things, when and where',
  description:
    'Every command that changes something appends a line to ~/.cdwr/history.jsonl. Read-only commands are not recorded.',
  danger: 'read',
  inputs: {
    limit: input.number({
      prompt: 'How many entries?',
      description: 'Newest entries to show',
      default: 20
    })
  },

  async plan(ctx, { limit }) {
    return readOnly(readHistory(cdwrHome(ctx.env)).slice(0, limit));
  },

  async apply(ctx, entries) {
    if (entries.length === 0) {
      return { summary: 'Nothing recorded yet', json: [] };
    }
    ctx.ui.table(
      ['when', 'command', 'target', 'outcome', 'took', 'summary'],
      entries.map((e) => [
        theme.muted(e.at.replace('T', ' ').slice(0, 19)),
        e.command,
        [e.target?.environment, e.target?.name].filter(Boolean).join(' / '),
        e.outcome === 'done'
          ? symbols.ok
          : e.outcome === 'partial'
            ? symbols.warn
            : symbols.fail,
        `${(e.took / 1000).toFixed(1)}s`,
        e.summary
      ])
    );
    return { summary: `${entries.length} entries`, json: entries };
  }
});
