/**
 * Whether an editor-entered link can go in an `href`: a root-relative path or
 * an `http(s)` address. Anything else, `javascript:` and `data:` included, is
 * refused rather than sanitised. Tested as a browser reads it, without the
 * tabs and newlines it strips, so `/<tab>/host` cannot pass as a path.
 */
export const isSafeLinkHref = (value: string | null | undefined): boolean =>
  /^(?:https?:\/\/|\/(?![/\\]))/i.test(
    value?.trim().replace(/[\t\n\r]/g, '') ?? ''
  );
