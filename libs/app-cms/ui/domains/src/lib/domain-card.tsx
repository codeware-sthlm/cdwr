import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@codeware/shared/ui/shadcn/components/alert';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { Card, CardContent } from '@codeware/shared/ui/shadcn/components/card';
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  ShieldCheckIcon,
  TrashIcon
} from '@heroicons/react/24/outline';

import { DnsRecord, type DnsRecordProps } from './dns-record';
import {
  type DomainCertificateStatus,
  DomainStatusBadge
} from './domain-status-badge';
import {
  type IssuedCertificate,
  IssuedCertificates
} from './issued-certificates';
import { ResolverReport, type ResolverReportProps } from './resolver-report';

export type { DomainCertificateStatus };

export type DomainAction = 'request' | 'check' | 'remove' | 'resolvers';

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
  /** The records to create at the registrar, until the certificate is active */
  dns?: DnsRecordProps['validation'] | null;
  /**
   * What Fly has issued, once it has issued anything.
   *
   * Empty for every certificate stored before this was recorded, which is why
   * the block renders on having rows rather than on the status being active.
   */
  issued?: Array<IssuedCertificate> | null;
  /** Who signed them, e.g. `lets_encrypt` */
  certificateAuthority?: string | null;
  /**
   * What the public resolvers said, once someone has asked.
   *
   * Live and slow, so it is never fetched with the rest of the card — an
   * untouched card has nothing here, and that is the normal state.
   */
  resolvers?: Omit<ResolverReportProps, 'labels'> | null;
  /**
   * What Fly resolved the last time it was asked, and what it objected to.
   *
   * Only known after a check — it is live resolution rather than stored state,
   * so an untouched card has nothing to say here.
   */
  check?: {
    /** Fly's own validation issues, already phrased for the domain's owner */
    issues?: Array<string> | null;
    /** Value for the `_fly-ownership` TXT record */
    ownershipRecord?: string | null;
    /** What Fly's last check found already in place */
    confirmed?: DnsRecordProps['confirmed'];
  } | null;
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
    copyRecord: string;
    dnsLede: string;
    dnsNameHint: string;
    dnsOwnershipLede: string;
    dnsTrafficLede: string;
    dnsValidationLede: string;
    issuesHeading: string;
    /** Heading for the same box, once the certificate is issued and answering */
    issuesActiveHeading: string;
    apexNote: string;
    /** The dns block's lede once the certificate is issued and clean */
    dnsSettledLede: string;
    issuedHeading: string;
    /** Prefixes the certificate authority, e.g. "issued by" */
    issuedBy: string;
    compareResolvers: string;
    resolversHeading: string;
    resolversAgree: string;
    resolversDisagree: string;
    resolversNoAnswer: string;
    resolversUnreachable: string;
  };
  onAction: (action: DomainAction) => void;
};

/**
 * One custom domain: what its certificate is doing, and what is left to do.
 *
 * A custom domain needs two halves, and neither side can finish alone: the
 * platform asks Fly for a certificate, and whoever owns the domain creates the
 * dns records that let it validate. The card drives the first half and spells
 * out the second — which record to create and whether Fly can see it yet.
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
  dns,
  issued,
  certificateAuthority,
  resolvers,
  check,
  saved,
  runningAction,
  disabled = false,
  labels,
  onAction
}: DomainCardProps) {
  const requested = status !== 'not-requested';
  const active = status === 'active';
  // Issued, with no known outstanding issue — true both when a check ran
  // clean and when none has run yet (a fresh page load has no `check` at
  // all), as opposed to an active certificate Fly is still objecting to
  const settled = active && !check?.issues?.length;

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

        {/* Fly's own diagnosis, set apart in its own box so it never reads as
          part of the suggestion below it — the two describe the problem
          differently (missing AAAA vs. a CNAME to create) without disagreeing.
          Neutral once active: nothing a live check reports on an already-
          issued certificate is fatal by definition, so it must not read as
          an error the way it does before the domain is answering */}
        {requested && check?.issues?.length ? (
          <Alert variant={active ? 'default' : 'destructive'}>
            <ExclamationTriangleIcon />
            <AlertTitle>
              {active ? labels.issuesActiveHeading : labels.issuesHeading}
            </AlertTitle>
            <AlertDescription>
              <ul className="flex flex-col gap-1">
                {check.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        {resolvers && (
          <ResolverReport
            answers={resolvers.answers}
            agree={resolvers.agree}
            negativeCacheNote={resolvers.negativeCacheNote}
            labels={{
              heading: labels.resolversHeading,
              agreeLede: labels.resolversAgree,
              disagreeLede: labels.resolversDisagree,
              noAnswer: labels.resolversNoAnswer,
              unreachable: labels.resolversUnreachable
            }}
          />
        )}

        {issued?.length ? (
          <IssuedCertificates
            certificates={issued}
            authority={certificateAuthority}
            labels={{
              heading: labels.issuedHeading,
              issuedBy: labels.issuedBy
            }}
          />
        ) : null}

        {/* Stays visible for the life of the domain, not just until the
          certificate validates — the records are still what the domain
          runs on, and hiding them on an active cert would hide the exact
          case (green, but still not loading) this block exists to catch */}
        {requested && dns && (
          <DnsRecord
            hostname={hostname}
            app={app}
            validation={dns}
            ownershipRecord={check?.ownershipRecord}
            confirmed={check?.confirmed}
            settled={settled}
            labels={{
              trafficLede: labels.dnsTrafficLede,
              validationLede: labels.dnsValidationLede,
              ownershipLede: labels.dnsOwnershipLede,
              instructionsLede: labels.dnsLede,
              apexNote: labels.apexNote,
              nameHint: labels.dnsNameHint,
              settledLede: labels.dnsSettledLede,
              copyRecord: labels.copyRecord
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
                {/* Its own button rather than part of a check: three dns
                    queries and an SOA lookup are slow, and the answer only
                    matters once something already looks wrong */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onAction('resolvers')}
                >
                  <ActionIcon
                    idle={GlobeAltIcon}
                    running={runningAction === 'resolvers'}
                  />
                  {labels.compareResolvers}
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
function ActionIcon({
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
