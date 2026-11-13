import { Prism } from 'prism-react-renderer';

/**
 * A small shell grammar, since prism-react-renderer bundles none: comments,
 * strings, variables, the command word, flags and operators.
 */
Prism.languages['shell'] ??= {
  comment: { pattern: /(^|\s)#.*/, lookbehind: true },
  string: { pattern: /(["'])(?:\\.|(?!\1)[^\\])*\1/, greedy: true },
  variable: /\$(?:\w+|\{[^}]+\})/,
  function: {
    pattern: /(^|(?:&&|\|\||[|;])\s*)[\w./@-]+/m,
    lookbehind: true
  },
  property: { pattern: /(\s)--?[\w-]+/, lookbehind: true },
  operator: /&&|\|\||[|;<>]/
};
