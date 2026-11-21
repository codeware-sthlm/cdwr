import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@codeware/shared/ui/shadcn/components/alert';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  ExclamationTriangleIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline';

import { InfoPopover, RecordRow, type RequiredRecord } from './dns-record';
import { ActionIcon } from './domain-card';
import {
  type IssuedCertificate,
  IssuedCertificates
} from './issued-certificates';
import { ResolverReport, type ResolverReportProps } from './resolver-report';

export type DomainDetailsProps = {
  /** The certificate is issued, which makes Fly's issues advice, not errors */
  active: boolean;
  /** Fly's own validation issues, already phrased for the domain's owner */
  issues?: Array<string> | null;
  /**
   * What the public resolvers said, once someone has asked.
   *
   * Live and slow, so it is never fetched with the rest of the panel — an
   * untouched sheet has nothing here, and that is the normal state.
   */
  resolvers?: Omit<ResolverReportProps, 'labels'> | null;
  /** What Fly has issued, once it has issued anything */
  issued?: Array<IssuedCertificate> | null;
  /** Who signed them, e.g. `lets_encrypt` */
  certificateAuthority?: string | null;
  /** The `_acme-challenge` CNAME, when Fly has given one */
  challenge?: RequiredRecord | null;
  /** Fly's own prose, for a challenge that is not a plain CNAME */
  instructions?: string | null;
  /** The `_fly-ownership` TXT record, when Fly has offered one */
  ownership?: RequiredRecord | null;
  /** The resolvers are being asked right now */
  comparing?: boolean;
  /** An action running anywhere, which locks the button */
  disabled?: boolean;
  labels: {
    issuesHeading: string;
    /** Heading for the same box, once the certificate is issued and answering */
    issuesActiveHeading: string;
    compareResolvers: string;
    resolversHeading: string;
    resolversAgree: string;
    resolversDisagree: string;
    resolversNoAnswer: string;
    resolversUnreachable: string;
    issuedHeading: string;
    issuedBy: string;
    optionalHeading: string;
    /** What the challenge record is for, behind its info icon */
    challengeHelp: string;
    /** When the ownership record is worth adding, behind its info icon */
    ownershipHelp: string;
    /** Lede for Fly's prose, which is not always the challenge */
    instructionsLede: string;
    copyRecord: string;
    moreInfo: string;
  };
  onCompare: () => void;
};

/**
 * Everything about a domain that is not the next step: Fly's own diagnosis,
 * what the public resolvers see, the issued certificates and the optional
 * records.
 *
 * The body of the card's Details sheet. Presentational, like the card: the
 * panel owns the sheet and hands in every label and value.
 */
export function DomainDetails({
  active,
  issues,
  resolvers,
  issued,
  certificateAuthority,
  challenge,
  instructions,
  ownership,
  comparing = false,
  disabled = false,
  labels,
  onCompare
}: DomainDetailsProps) {
  const recordLabels = {
    copyRecord: labels.copyRecord,
    moreInfo: labels.moreInfo
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Neutral once active: nothing a live check reports on an already-
          issued certificate is fatal by definition */}
      {issues?.length ? (
        <Alert variant={active ? 'default' : 'destructive'}>
          <ExclamationTriangleIcon />
          <AlertTitle>
            {active ? labels.issuesActiveHeading : labels.issuesHeading}
          </AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="flex flex-col gap-2">
        {/* Its own button rather than part of a check: a dozen dns queries
            are slow, and the answer only matters once something looks wrong */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={disabled}
          onClick={onCompare}
        >
          <ActionIcon idle={GlobeAltIcon} running={comparing} />
          {labels.compareResolvers}
        </Button>
        {resolvers && (
          <ResolverReport
            {...resolvers}
            labels={{
              heading: labels.resolversHeading,
              agreeLede: labels.resolversAgree,
              disagreeLede: labels.resolversDisagree,
              noAnswer: labels.resolversNoAnswer,
              unreachable: labels.resolversUnreachable
            }}
          />
        )}
      </section>

      {issued?.length ? (
        <IssuedCertificates
          certificates={issued}
          authority={certificateAuthority}
          labels={{ heading: labels.issuedHeading, issuedBy: labels.issuedBy }}
        />
      ) : null}

      {challenge || instructions || ownership ? (
        <section className="bg-muted/40 flex flex-col gap-2 rounded-md px-3.5 py-3">
          <p className="text-muted-foreground">{labels.optionalHeading}</p>
          {challenge ? (
            <div className="flex items-start gap-1">
              <div className="grow">
                <RecordRow record={challenge} labels={recordLabels} />
              </div>
              <InfoPopover label={labels.moreInfo}>
                {labels.challengeHelp}
              </InfoPopover>
            </div>
          ) : (
            instructions && (
              // Fly falls back to prose when the record is not a plain CNAME,
              // and what it describes there is not always the challenge
              <div className="flex flex-col gap-1">
                <p className="text-muted-foreground text-xs">
                  {labels.instructionsLede}
                </p>
                <p className="text-xs whitespace-pre-line">{instructions}</p>
              </div>
            )
          )}
          {ownership && (
            <div className="flex items-start gap-1">
              <div className="grow">
                <RecordRow record={ownership} labels={recordLabels} />
              </div>
              <InfoPopover label={labels.moreInfo}>
                {labels.ownershipHelp}
              </InfoPopover>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
