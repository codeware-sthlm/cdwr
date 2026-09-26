import { Code } from '@codeware/shared/ui/code';
import type { CodeBlock as CodeBlockProps } from '@codeware/shared/util/payload-types';

type Props = CodeBlockProps;

/**
 * Drawn in both highlight themes, with CSS showing the one that fits.
 *
 * The scheme is not known on the server when a visitor follows their system
 * setting, so choosing a theme in render drew the light one there and the dark
 * one in the browser, and React does not repair attributes on hydration. The
 * `dark:` variant also follows a strong band, which the page's scheme did not.
 */
export const CodeBlock: React.FC<Props> = ({ code, language }) => (
  <>
    <div className="dark:hidden">
      <Code code={code} language={language} theme="vsLight" />
    </div>
    <div className="hidden dark:block">
      <Code code={code} language={language} theme="vsDark" />
    </div>
  </>
);
