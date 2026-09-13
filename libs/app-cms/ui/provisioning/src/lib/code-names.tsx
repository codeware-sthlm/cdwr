import { Fragment } from 'react';

/** A setting name as Infisical holds it: `DEPLOY_RULES`, `PAYLOAD_API_KEY` */
const SETTING_NAME = /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g;

/** Split text into plain runs and setting names, in order */
export const splitCodeNames = (
  text: string
): Array<{ text: string; code: boolean }> =>
  text
    .split(SETTING_NAME)
    // A capturing split puts every match at an odd index
    .map((part, index) => ({ text: part, code: index % 2 === 1 }))
    .filter(({ text: part }) => part !== '');

/**
 * Translated text with its setting names set in a monospace font.
 *
 * The names live inside translated strings, so they cannot carry markup of
 * their own; they are recognised by shape instead.
 */
export function CodeNames({ text }: { text: string }) {
  return (
    <>
      {splitCodeNames(text).map(({ text: part, code }, index) =>
        code ? (
          <span key={index} className="font-mono">
            {part}
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </>
  );
}
