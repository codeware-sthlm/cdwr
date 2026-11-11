import {
  Alert,
  AlertDescription
} from '@codeware/shared/ui/shadcn/components/alert';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { Card, CardContent } from '@codeware/shared/ui/shadcn/components/card';
import {
  ArrowPathIcon,
  DocumentMagnifyingGlassIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  TrashIcon
} from '@heroicons/react/24/outline';

import { DnsRecord, type DnsRecordProps } from './dns-record';
import {
  type DomainCertificateStatus,
  DomainStatusBadge
} from './domain-status-badge';

export type { DomainCertificateStatus };

export type DomainAction =
  'request' | 'check' | 'remove' | 'resolvers' | 'details';

export type DomainCardProps = {
  hostname: string;
  /** Fly app that serves the domain */
  app: string;
  status: DomainCertificateStatus;
  /**
   * Fly's own wording for a pending certificate, which names the step it is
   * waiting on better than the generic label
   */
  statusDetail?: string | null;
  /** Pre-formatted "Checked 14 Aug 22:42"; the panel owns date formatting */
  checkedLabel?: string | null;
  /** Pre-composed sentence naming when the rate limit lifts */
  pausedMessage?: string | null;
  /**
   * The one thing to do next, pre-composed from Fly's status and whatever
   * the resolvers turned up. None once the domain is settled.
   */
  nextStep?: string | null;
  /** The records the domain needs, for as long as it has a certificate */
  dns?: Omit<DnsRecordProps, 'labels'> | null;
  /** A row the server does not have yet cannot be acted on */
  saved: boolean;
  /** The action running on this row, which is the one that spins */
  runningAction?: DomainAction | null;
  /** An action running anywhere, which locks every button */
  disabled?: boolean;
  labels: {
    active: string;
    pending: string;
    notRequested: string;
    paused: string;
    saveFirst: string;
    request: string;
    check: string;
    remove: string;
    details: string;
    copyRecord: string;
    moreInfo: string;
  };
  onAction: (action: DomainAction) => void;
};

/**
 * One custom domain: what its certificate is doing, and what is left to do.
 *
 * A custom domain needs two halves, and neither side can finish alone: the
 * platform asks Fly for a certificate, and whoever owns the domain creates the
 * dns records that let it validate. The card leads with three things: Fly's
 * status, the one step left, and the records to create. Diagnostics, optional
 * records and the resolver report sit behind **Details**, so what matters is
 * not lost among them.
 *
 * Presentational and hook-free: every label arrives translated and every date
 * pre-formatted, so the same card renders in the admin and in Storybook.
 */
export function DomainCard({
  hostname,
  app,
  status,
  statusDetail,
  checkedLabel,
  pausedMessage,
  nextStep,
  dns,
  saved,
  runningAction,
  disabled = false,
  labels,
  onAction
}: DomainCardProps) {
  const requested = status !== 'not-requested';

  return (
    <Card variant="bordered" className="gap-0 py-0">
      <CardContent className="flex flex-col gap-3 px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-medium">{hostname}</span>
            <span className="text-muted-foreground text-xs">{app}</span>
          </span>
          <DomainStatusBadge
            status={status}
            detail={statusDetail}
            labels={labels}
          />
        </div>

        {checkedLabel && (
          <span className="text-muted-foreground -mt-2 text-xs">
            {checkedLabel}
          </span>
        )}

        {status === 'paused' && pausedMessage && (
          <Alert variant="destructive">
            <ExclamationTriangleIcon />
            <AlertDescription>{pausedMessage}</AlertDescription>
          </Alert>
        )}

        {requested && nextStep && <p>{nextStep}</p>}

        {/* Stays visible for the life of the domain, not just until the
          certificate validates — the records are still what the domain
          runs on, and hiding them on an active cert would hide the exact
          case (green, but still not loading) this block exists to catch */}
        {requested && dns && (
          <DnsRecord
            {...dns}
            labels={{
              copyRecord: labels.copyRecord,
              moreInfo: labels.moreInfo
            }}
          />
        )}

        {saved ? (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {!requested ? (
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => onAction('request')}
              >
                <ActionIcon
                  idle={ShieldCheckIcon}
                  running={runningAction === 'request'}
                />
                {labels.request}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onAction('check')}
                >
                  <ActionIcon
                    idle={ArrowPathIcon}
                    running={runningAction === 'check'}
                  />
                  {labels.check}
                </Button>
                {/* Opens the sheet, so it never locks with the others */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAction('details')}
                >
                  <DocumentMagnifyingGlassIcon className="size-4" />
                  {labels.details}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onAction('remove')}
                >
                  <ActionIcon
                    idle={TrashIcon}
                    running={runningAction === 'remove'}
                  />
                  {labels.remove}
                </Button>
              </>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">{labels.saveFirst}</p>
        )}
      </CardContent>
    </Card>
  );
}

type IconComponent = React.ComponentType<{ className?: string }>;

/**
 * A button's icon, replaced by a spinner while that button is the one working.
 *
 * Per action rather than per row: with one shared flag, asking for a check
 * would spin the remove button too.
 */
export function ActionIcon({
  idle: Idle,
  running
}: {
  idle: IconComponent;
  running: boolean;
}) {
  return running ? (
    <ArrowPathIcon className="size-4 animate-spin" />
  ) : (
    <Idle className="size-4" />
  );
}
