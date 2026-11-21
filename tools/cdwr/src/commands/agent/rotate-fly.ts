import { defineCommand } from '../../cli/command';
import { CliError, EXIT } from '../../cli/errors';

export default defineCommand({
  summary: 'New Fly tokens for the agent host, the old ones revoked',
  description:
    'Creates new Fly tokens for the agent host, restarts the agent container on them and revokes the old tokens.',
  danger: 'destructive',
  inputs: {},

  async plan() {
    throw new CliError('Not implemented yet', EXIT.failed);
  },

  async apply() {
    return { summary: 'Not implemented yet' };
  }
});
