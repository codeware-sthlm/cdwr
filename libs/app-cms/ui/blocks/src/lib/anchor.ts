/** An anchor is lowercase letters, digits and dashes, so `#anchor` reaches it */
export const anchorFormat = (value: string): true | string =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
    ? true
    : 'Lowercase letters, digits and dashes only';
