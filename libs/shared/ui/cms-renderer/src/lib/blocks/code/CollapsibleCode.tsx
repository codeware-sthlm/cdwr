'use client';

import { t } from '@codeware/shared/util/i18n';
import { cn } from '@codeware/shared/util/ui';
import { useId, useState } from 'react';

import { usePayload } from '../../providers/PayloadProvider';

/**
 * Cuts code longer than `visibleLines` off behind a fade, with a button to
 * show all of it and to collapse it again.
 *
 * The code stays in the page while collapsed, only clipped, so copying and
 * find-in-page still reach every line.
 */
export function CollapsibleCode({
  children,
  lineCount,
  visibleLines
}: {
  children: React.ReactNode;
  lineCount: number;
  visibleLines: number | null | undefined;
}) {
  const { locale } = usePayload();
  const [expanded, setExpanded] = useState(false);
  const id = useId();

  if (!visibleLines || lineCount <= visibleLines) {
    return children;
  }

  return (
    <div>
      <div
        id={id}
        className={cn(
          'overflow-hidden',
          !expanded &&
            'mask-b-from-60% [&_pre]:rounded-b-none [&_pre]:border-b-0'
        )}
        // A line is 1rem at the code's text size, plus the panel's top padding
        style={expanded ? undefined : { maxHeight: `${visibleLines + 1}rem` }}
      >
        {children}
      </div>
      <div className="mt-2 flex justify-center">
        <button
          type="button"
          aria-controls={id}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="text-core-link text-sm font-medium hover:underline hover:underline-offset-4"
        >
          {expanded
            ? t(locale, 'code.showLess')
            : t(locale, 'code.showAll', { count: String(lineCount) })}
        </button>
      </div>
    </div>
  );
}
