import { Badge } from '@codeware/shared/ui/shadcn/components/badge';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

import type { LinkComponent } from './types';

export type MailFailureRowProps = {
  /** Parent form title, or a fallback when the form is gone */
  formTitle: string;
  /** Which workspace the submission belongs to */
  owner: string;
  /**
   * Why this counts as a failure — an outage the transport rejected, or a
   * misconfiguration that left it nowhere to go. Drives the badge's tone.
   */
  reason: 'failed' | 'no-recipient';
  /** Pre-translated text for the badge */
  reasonLabel: string;
  /** Pre-formatted relative time, e.g. `2 hours ago` */
  receivedLabel: string;
  /** ISO timestamp behind `receivedLabel`, for the `<time>` element */
  receivedAt: string;
  /** Admin url of the submission */
  href: string;
  linkComponent?: LinkComponent;
};

/**
 * One undelivered form submission, linking straight to it.
 *
 * Mirrors `DomainStatusRow`'s layout — a title and a muted subline on the
 * left, a badge on the right — so the two sheets this dashboard opens read as
 * one family rather than two different tables. `failed` reads as an outage
 * (destructive, matching `DomainStatusBadge`'s `paused`); `no-recipient` is a
 * settings problem the admin can fix themselves, tinted like the same
 * component's `pending` rather than alarmed like an outage.
 */
export function MailFailureRow({
  formTitle,
  owner,
  reason,
  reasonLabel,
  receivedLabel,
  receivedAt,
  href,
  linkComponent: LinkComp = 'a'
}: MailFailureRowProps) {
  return (
    <LinkComp
      href={href}
      className="hover:bg-muted/60 focus-visible:ring-ring flex items-center gap-3 rounded-md px-2 py-2 focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{formTitle}</p>
        <p className="text-muted-foreground truncate text-xs">{owner}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {reason === 'failed' ? (
          <Badge variant="destructive">
            <ExclamationTriangleIcon />
            {reasonLabel}
          </Badge>
        ) : (
          <Badge variant="warning">
            <ExclamationTriangleIcon />
            {reasonLabel}
          </Badge>
        )}
        <time dateTime={receivedAt} className="text-muted-foreground text-xs">
          {receivedLabel}
        </time>
      </div>
    </LinkComp>
  );
}
