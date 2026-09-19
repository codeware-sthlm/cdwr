import { defineCommand, readOnly } from '../cli/command';
import { SHELLS, collect, render } from '../cli/completion';
import { input } from '../cli/inputs';

import { ENTRIES, GROUPS } from './index';

export default defineCommand({
  summary: 'Print the completion script for zsh, bash or fish',
  description:
    'Static: commands, subcommands and flags, generated from the registry. `cdwr setup` installs it for you.',
  danger: 'read',
  inputs: {
    shell: input.enum(SHELLS, {
      prompt: 'Which shell?',
      positional: true,
      default: () => shellOf(process.env['SHELL'])
    })
  },

  async plan(_ctx, { shell }) {
    return readOnly({ shell, commands: await collect(ENTRIES) });
  },

  async apply(ctx, { shell, commands }) {
    const script = render(shell, GROUPS, commands);
    ctx.ui.write(script);
    return {
      summary: `${shell} completion for ${commands.length} commands`,
      json: { shell, script }
    };
  }
});

/** The shell named by $SHELL, when it is one we complete for */
export const shellOf = (path: string | undefined) => {
  const name = path?.split('/').pop();
  return SHELLS.find((s) => s === name);
};
