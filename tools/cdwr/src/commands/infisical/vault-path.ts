import { input } from '../../cli/inputs';

/** `--path`: the Infisical folder an app reads, sub-folders included */
export const vaultPathInput = () =>
  input.string({
    prompt: 'Which Infisical path?',
    description: 'The app folder, sub-folders included, e.g. /apps/cms',
    default: '/apps/cms',
    remember: true
  });
