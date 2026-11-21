import type { EmailAdapter } from 'payload';

/** The entities {@link escape} produces; `&amp;` last so it never decodes twice */
const decodeEntities = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/** Replace until nothing matches, so removing one match cannot assemble another */
const replaceUntilStable = (
  input: string,
  pattern: RegExp,
  replacement: string
): string => {
  let current = input;
  for (;;) {
    const next = current.replace(pattern, replacement);
    if (next === current) return current;
    current = next;
  }
};

const stripTags = (value: string): string =>
  replaceUntilStable(value, /<[^>]*>/g, '');

/**
 * A plain text rendering of an html mail.
 *
 * Meant for markup this codebase writes or Payload's own mails, not for
 * arbitrary html: block ends become line breaks, a link becomes `label: url`
 * and every other tag is dropped. Whatever sits between `<!--text:skip-->`
 * and `<!--/text:skip-->` is left out.
 */
export const htmlToText = (html: string): string =>
  decodeEntities(
    stripTags(
      [
        [/<!--text:skip-->[\s\S]*?<!--\/text:skip-->/g, ''],
        [/<head\b[\s\S]*?<\/head\b[^>]*>/gi, ''],
        [/<style\b[\s\S]*?<\/style\b[^>]*>/gi, ''],
        [/<script\b[\s\S]*?<\/script\b[^>]*>/gi, '']
      ]
        .reduce(
          (acc, [pattern, replacement]) =>
            replaceUntilStable(acc, pattern as RegExp, replacement as string),
          html
        )
        .replace(
          /<a\b[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
          (_match, url: string, label: string) => {
            const text = stripTags(label).trim();
            return !text || text === url ? url : `${text}: ${url}`;
          }
        )
        .replace(/<br\s*\/?>|<\/(?:p|tr|div|h[1-6])>/gi, '\n')
    )
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Give every html-only mail a text part.
 *
 * Payload's own mails (forgot password, verify) and the form builder's
 * notifications go out as html alone, which spam filters weigh against the
 * sender. A message that already has a text part, or has no html to derive one
 * from, passes through unchanged.
 */
export const withTextPart = (
  adapter: EmailAdapter | Promise<EmailAdapter>
): EmailAdapter | Promise<EmailAdapter> => {
  const wrap: (factory: EmailAdapter) => EmailAdapter = (factory) => (args) => {
    const inner = factory(args);

    return {
      ...inner,
      sendEmail: (message) =>
        inner.sendEmail(
          !message.text && typeof message.html === 'string'
            ? { ...message, text: htmlToText(message.html) }
            : message
        )
    };
  };

  return adapter instanceof Promise ? adapter.then(wrap) : wrap(adapter);
};
