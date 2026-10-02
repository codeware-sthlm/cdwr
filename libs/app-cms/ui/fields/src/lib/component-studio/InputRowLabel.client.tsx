'use client';

import { Badge } from '@codeware/shared/ui/shadcn/components/badge';
import { useRowLabel } from '@payloadcms/ui';
import type React from 'react';

import { readPropsSchema } from './sync-props';

/**
 * A declared input in its collapsed row: the name, its type and whether it is
 * required. Names share a column width so the badges line up from row to row.
 */
const InputRowLabel: React.FC = () => {
  const { data } = useRowLabel<unknown>();
  const [input] = readPropsSchema([data]);

  if (!input?.name) {
    return <span className="twp text-muted-foreground text-sm">New input</span>;
  }

  return (
    <span className="twp grid min-w-0 grid-cols-[6rem_auto] items-center gap-x-2 text-sm">
      <code className="truncate">{input.name}</code>
      <span className="flex items-center gap-1.5">
        <Badge variant="muted">{input.type}</Badge>
        {input.required && <Badge variant="outline">required</Badge>}
      </span>
    </span>
  );
};

export default InputRowLabel;
