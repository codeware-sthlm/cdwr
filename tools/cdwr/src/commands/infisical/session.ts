import { deployEnvironment } from '@codeware/shared/util/infisical-cli';

import { defineCommand, readOnly } from '../../cli/command';
import { CliError, EXIT } from '../../cli/errors';

import { type SessionState, probeSession } from './session.logic';

export default defineCommand({
  summary: 'Whether the Infisical CLI is installed and logged in',
  description:
    'Lists the root folders through the Infisical CLI. No token is read or printed.',
  danger: 'read',
  inputs: {},

  async plan(ctx) {
    const environment = deployEnvironment(ctx.env);
    const session = await ctx.ui.task(
      'Checking the Infisical session',
      async () => probeSession(environment),
      (probed) => probed.state
    );
    return readOnly(session);
  },

  async apply(_ctx, session: SessionState) {
    if (session.state !== 'ok') {
      throw new CliError(
        session.state === 'failed'
          ? session.message
          : 'Infisical CLI is not installed',
        EXIT.failed,
        session.hint
      );
    }
    return {
      summary: 'Infisical CLI installed and logged in',
      json: session
    };
  }
});
