import { Code } from '@codeware/shared/ui/code';
import type { CodeBlock as CodeBlockProps } from '@codeware/shared/util/payload-types';

import { CollapsibleCode } from './CollapsibleCode';

type Props = CodeBlockProps;

/**
 * Drawn in both highlight themes, with CSS showing the one that fits.
 *
 * The scheme is not known on the server when a visitor follows their system
 * setting, so choosing a theme in render drew the light one there and the dark
 * one in the browser, and React does not repair attributes on hydration. The
 * `dark:` variant also follows a strong band, which the page's scheme did not.
 *
 * As wide as the column, scrolling when a line is longer. An optional header
 * sits above it, and long code can be cut off to a number of lines.
 */
export const CodeBlock: React.FC<Props> = ({
  eyebrow,
  heading,
  intro,
  code,
  language,
  visibleLines
}) => (
  <div>
    {(eyebrow || heading || intro) && (
      <div className="mb-6 max-w-xl">
        {eyebrow && (
          <p className="text-core-link text-sm font-semibold tracking-[0.14em] uppercase">
            {eyebrow}
          </p>
        )}
        {heading && (
          <h2 className="text-core-headline mt-3 text-3xl font-semibold tracking-tight first:mt-0">
            {heading}
          </h2>
        )}
        {intro && (
          <p className="text-muted-foreground mt-3.5 text-base leading-relaxed first:mt-0">
            {intro}
          </p>
        )}
      </div>
    )}
    <CollapsibleCode
      lineCount={code.split('\n').length}
      visibleLines={visibleLines}
    >
      <div className="dark:hidden">
        <Code
          code={code}
          language={language}
          theme="vsLight"
          className="w-full"
        />
      </div>
      <div className="hidden dark:block">
        <Code
          code={code}
          language={language}
          theme="vsDark"
          className="w-full"
        />
      </div>
    </CollapsibleCode>
  </div>
);
