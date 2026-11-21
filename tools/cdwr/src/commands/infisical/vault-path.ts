import { input } from '../../cli/inputs';

/** `--path`: the Infisical folder an app reads, sub-folders included */
export const vaultPathInput = () =>
  input.string({
    prompt: 'Which Infisical path?',
    description: 'The app folder, sub-folders included, e.g. /apps/cms',
    default: '/apps/cms',
    short: 'p',
    remember: true
  });

/** `--app`: the app that runs, when it is not the one whose folder is read */
export const appInput = () =>
  input.string({
    prompt: 'Which app runs?',
    description:
      'The app owning the offline cache and .env, when it differs from the one in --path, e.g. headless',
    short: 'a',
    optional: true,
    flagOnly: true
  });
