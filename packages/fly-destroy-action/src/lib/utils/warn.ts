import * as core from '@actions/core';

const messages: string[] = [];

/** The summary is raw HTML, and CLI output can hold `<app>` or `&` */
const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Warn in the log and collect the message for the step summary.
 *
 * Warnings are written to the summary once at the end by
 * `writeWarningsSummary`: `reportVolumeUsage` flushes `core.summary`
 * mid-run, so a warning written as it happens would land under
 * that heading.
 */
export const warn = (message: string): void => {
  core.warning(message);
  messages.push(message);
};

/**
 * Write the collected warnings as one summary section, then clear them.
 *
 * Never throws: the warnings are already in the log, and a failed write
 * must not replace the run's own outcome.
 */
export const writeWarningsSummary = async (): Promise<void> => {
  if (messages.length === 0) {
    return;
  }
  const collected = messages.splice(0).map(escapeHtml);
  try {
    await core.summary.addHeading('Warnings', 3).addList(collected).write();
  } catch (error) {
    core.info(
      `Could not write the warnings to the step summary: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};
