'use client';

import {
  type Platform,
  SocialIcon,
  getSocialIconName
} from '@codeware/shared/ui/primitives';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@codeware/shared/ui/shadcn/components/tooltip';
import { t } from '@codeware/shared/util/i18n';
import { cn } from '@codeware/shared/util/ui';
import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { usePayload } from '../providers/PayloadProvider';

/**
 * Implicit contract: the shape of a `socialLinksField` row as it comes out of
 * the editor, shared by the social media block and the footer contacts.
 */
export type SocialLink = {
  platform: Platform;
  email?: string | null;
  phone?: string | null;
  url?: string | null;
  withLabel?: boolean | null;
  label?: string | null;
  id?: string | null;
};

type SocialLinksProps = {
  className?: string;
  direction?: ('horizontal' | 'vertical') | null;
  links: Array<SocialLink>;
};

/**
 * Stable identity for a row.
 *
 * `id` is optional on the field data, and a `null` id would match the initial
 * copied state — every such row would render as already copied.
 */
const linkKey = (item: SocialLink): string =>
  item.id || item.url || item.email || item.phone || item.platform;

/**
 * Render social links in a flex layout.
 *
 * Displays social media icons with clickable links.
 *
 * - Email and Phone: Click to copy value to clipboard
 * - Others: Click to navigate to the platform URL
 */
export const SocialLinks: React.FC<SocialLinksProps> = ({
  className,
  direction,
  links
}) => {
  const { navigate, locale } = usePayload();

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!links.length) {
    return null;
  }

  /** Feedback when the clipboard is unavailable or refuses the write */
  const notifyCopyFailed = () => {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(t(locale, 'social.copyFailed'));
    }
  };

  /** Handle click event for social links */
  const handleClick = async (item: SocialLink) => {
    // Prevent multiple clicks while copied state is active
    if (copiedKey) {
      return;
    }

    // Navigate to URL
    if (item.url) {
      return navigate(item.url);
    }

    // Guard against missing Clipboard API
    if (!navigator?.clipboard?.writeText) {
      notifyCopyFailed();
      return;
    }

    // Copy email or phone to clipboard
    const toCopy = item.email || item.phone;
    if (toCopy) {
      try {
        // Rejects on denied permissions or an insecure context
        await navigator.clipboard.writeText(toCopy);
      } catch {
        notifyCopyFailed();
        return;
      }
      setCopiedKey(linkKey(item));
      // Clear any existing timeout before setting a new one
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // Time to show feedback
      timeoutRef.current = setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  /** Get tooltip content for a social link */
  const getTooltipContent = (item: SocialLink) => {
    const { platform, email, phone } = item;
    if (copiedKey === linkKey(item)) {
      return t(locale, 'social.copied');
    }
    const toCopy = email || phone;
    if (toCopy) {
      return `${toCopy} (${t(locale, 'social.clickToCopy')})`;
    }
    return getSocialIconName(platform);
  };

  return (
    <div
      className={cn(
        'flex',
        direction === 'vertical' ? 'flex-col gap-4' : 'flex-wrap gap-6',
        className
      )}
    >
      {links.map((item) => {
        const key = linkKey(item);
        const isCopied = copiedKey === key;
        return (
          <div
            key={key}
            className="group flex items-center transition-all duration-300"
          >
            <TooltipProvider>
              <Tooltip key={isCopied ? 'copied' : 'default'}>
                <TooltipTrigger asChild>
                  {/* A button, not the bare icon — the icon is an <svg>, which
                      is neither focusable nor announced as interactive */}
                  <button
                    type="button"
                    // The visible label names the button when there is one
                    aria-label={
                      item.withLabel ? undefined : getTooltipContent(item)
                    }
                    className={cn(
                      'flex items-center gap-4 border-0 bg-transparent p-0 text-left',
                      'group-hover:text-core-link transition-all duration-300 group-hover:cursor-pointer',
                      isCopied && 'cursor-default'
                    )}
                    onClick={() => handleClick(item)}
                  >
                    {(isCopied && (
                      // Size should match social icon size
                      <Check className="text-core-link size-5" />
                    )) || (
                      <SocialIcon
                        className={cn(
                          'text-muted-foreground',
                          'group-hover:text-core-link transition-all duration-300 group-hover:scale-125'
                        )}
                        platform={item.platform}
                        size="small"
                      />
                    )}
                    {item.withLabel && (
                      // Below `sm` only the icon shows, and the label stays
                      // the button's accessible name
                      <span className="sr-only sm:not-sr-only">
                        {isCopied ? t(locale, 'social.copied') : item.label}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{getTooltipContent(item)}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      })}
    </div>
  );
};
