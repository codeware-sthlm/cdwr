import type { FaqTopic } from '@codeware/app-cms/util/definitions';

/**
 * Custom event that opens the help drawer from anywhere in the admin,
 * e.g. the command palette quick action. Its `detail` may carry a `topic`
 * to open that FAQ group.
 */
export const OPEN_HELP_EVENT = 'cdwr:open-help';

export type OpenHelpDetail = { topic: FaqTopic } | undefined;

/**
 * Custom event the help drawer sends when it closes, so a tour that sent the
 * user there can come back.
 */
export const HELP_CLOSED_EVENT = 'cdwr:help-closed';

/** Opens the help drawer, optionally on one FAQ topic. */
export const openHelp = (topic?: FaqTopic) => {
  window.dispatchEvent(
    new CustomEvent<OpenHelpDetail>(OPEN_HELP_EVENT, {
      detail: topic ? { topic } : undefined
    })
  );
};
