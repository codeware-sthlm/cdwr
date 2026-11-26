/**
 * Whether an editor-entered link can go in an `href`: a root-relative path or
 * an `http(s)` address. Anything else, `javascript:` and `data:` included, is
 * refused rather than sanitised.
 */
export const isSafeLinkHref = (value: string | null | undefined): boolean =>
  /^(?:https?:\/\/|\/(?![/\\]))/i.test(value?.trim() ?? '');
