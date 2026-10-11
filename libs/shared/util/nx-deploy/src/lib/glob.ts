const escapeRegex = (text: string): string =>
  text.replace(/[.+?^$()|[\]\\{}*]/g, '\\$&');

/** Index of the `}` closing the `{` at `open`, or -1 */
const closingBrace = (pattern: string, open: number): number => {
  let depth = 0;
  for (let i = open; i < pattern.length; i++) {
    if (pattern[i] === '{') depth++;
    if (pattern[i] === '}' && --depth === 0) return i;
  }
  return -1;
};

/** Split `a,b{c,d}` on the commas outside nested braces */
const splitAlternatives = (list: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '{') depth++;
    if (list[i] === '}') depth--;
    if (list[i] === ',' && depth === 0) {
      parts.push(list.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(list.slice(start));
  return parts;
};

const toSource = (pattern: string): string => {
  let source = '';
  let i = 0;

  while (i < pattern.length) {
    const rest = pattern.slice(i);

    if (rest.startsWith('**/')) {
      // Zero or more directories
      source += '(?:.*/)?';
      i += 3;
    } else if (rest === '**' || rest.startsWith('**')) {
      source += '.*';
      i += 2;
    } else if (rest[0] === '*') {
      // Within one path segment
      source += '[^/]*';
      i += 1;
    } else if (rest[0] === '{' && closingBrace(pattern, i) !== -1) {
      const close = closingBrace(pattern, i);
      const alternatives = splitAlternatives(pattern.slice(i + 1, close));
      source += `(?:${alternatives.map(toSource).join('|')})`;
      i = close + 1;
    } else {
      source += escapeRegex(rest[0]);
      i += 1;
    }
  }

  return source;
};

/**
 * Match a repository-relative path against a glob.
 *
 * Supports exactly what the ignore list needs and nothing more:
 * - `**` followed by `/` for zero or more directories, and `**` for anything
 * - `*` for any characters within one path segment
 * - `{a,b}` alternation
 *
 * Everything else is literal, including a leading dot.
 *
 * @param path - Path with forward slashes
 * @param pattern - Glob pattern
 */
export const matchesGlob = (path: string, pattern: string): boolean =>
  new RegExp(`^${toSource(pattern)}$`).test(path);
