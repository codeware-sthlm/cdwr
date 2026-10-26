'use client';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { cn } from '@codeware/shared/util/ui';
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

interface CopyButtonProps {
  code: string;
  className?: string;
  /** Accessible name, when "code" is not what is being copied */
  label?: string;
}

/**
 * A button that copies text to the clipboard when clicked.
 *
 * Positioned in the top right corner of the parent element.
 *
 * @param props - The component props.
 * @returns A React component that renders a copy button.
 */
export const CopyButton = ({
  code,
  className,
  label = 'Copy code'
}: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      // Without this it submits any form it is rendered inside — in the
      // Payload admin that saves the document on a copy
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      // The ghost hover is bg-muted, invisible on the muted surfaces it often sits on
      className={cn('hover:bg-foreground/10 absolute top-2 right-2', className)}
      aria-label={label}
    >
      {copied ? (
        <CheckIcon className="text-(--success-subtle)" />
      ) : (
        <ClipboardDocumentIcon />
      )}
    </Button>
  );
};

export default CopyButton;
