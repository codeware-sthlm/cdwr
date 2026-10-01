const RESERVED = new Set([
  'annotation-xml',
  'color-profile',
  'font-face',
  'font-face-src',
  'font-face-uri',
  'font-face-format',
  'font-face-name',
  'missing-glyph'
]);

const VALID = /^[a-z][a-z0-9._]*-[a-z0-9._-]*$/;

/** Returns an error message, or undefined when the name is a valid custom-element name. */
export const validateTagName = (tagName: string): string | undefined => {
  if (!VALID.test(tagName)) {
    return `"${tagName}" is not a valid custom element name: use lowercase letters, digits and at least one hyphen, starting with a letter`;
  }
  if (RESERVED.has(tagName)) {
    return `"${tagName}" is a reserved custom element name`;
  }
  return undefined;
};
