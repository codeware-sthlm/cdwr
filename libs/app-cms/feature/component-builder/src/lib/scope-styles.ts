import postcss, { type AtRule } from 'postcss';

/** At-rules whose contents are not selectors, and must stay where they are */
const KEPT_AT_RULES = new Set(['keyframes', 'property', 'font-face']);

const insideKeptAtRule = (node: AtRule['parent']): boolean => {
  let current = node;
  while (current && current.type !== 'root') {
    if (current.type === 'atrule' && KEPT_AT_RULES.has(current.name)) {
      return true;
    }
    current = current.parent;
  }
  return false;
};

/**
 * Confines a stylesheet to the element it was built for.
 *
 * A component's utilities land in the same cascade layer as the site's, and
 * later in the document, so an unscoped `.flex-col` would win over the site's
 * `sm:flex-row` on every element of the page once the stylesheet is in the
 * head. `:where()` carries no specificity, so inside the element the cascade
 * is what it was: the component's own classes still override the kit's.
 */
export const scopeStyles = (css: string, tagName: string): string => {
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    if (insideKeptAtRule(rule.parent)) {
      return;
    }
    rule.selectors = rule.selectors.map(
      (selector) => `:where(${tagName}) ${selector}`
    );
  });
  return root.toString();
};
