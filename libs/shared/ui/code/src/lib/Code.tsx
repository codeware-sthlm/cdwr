import { CopyButton } from '@codeware/shared/ui/copy-button';
import { Highlight, themes } from 'prism-react-renderer';
import React from 'react';

export type Props = {
  code: string;
  language?: string;
  className?: string;
  theme?: keyof typeof themes;
};

/**
 * React code component for highlighting code blocks.
 *
 * Theme defaults to `vsLight`.
 *
 * @param props - The component props.
 * @returns A React component that renders a code block with syntax highlighting.
 */
export const Code: React.FC<Props> = ({
  code,
  language = '',
  className = '',
  theme = 'vsLight'
}) => {
  if (!code) return null;

  return (
    <div className={`relative ${className}`}>
      <Highlight code={code} language={language} theme={themes[theme]}>
        {({ className, getLineProps, getTokenProps, style, tokens }) => (
          // The code scrolls inside the gutter kept for the copy button, so a
          // long line never runs underneath it
          <pre
            className={`${className} rounded-lg border border-slate-100 py-4 pr-12 pl-4 text-xs dark:border-slate-800`}
            style={style}
          >
            <div className="overflow-x-auto">
              {tokens.map((line, i) => (
                <div
                  key={i}
                  {...getLineProps({ className: 'table-row', line })}
                >
                  <span className="table-cell text-right text-slate-500 select-none">
                    {i + 1}
                  </span>
                  <span className="table-cell pl-4">
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </pre>
        )}
      </Highlight>
      <CopyButton code={code} />
    </div>
  );
};

export default Code;
