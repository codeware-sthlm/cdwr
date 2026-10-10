import { CopyButton } from '@codeware/shared/ui/copy-button';
import { CheckCircleIcon } from '@heroicons/react/24/outline';

export type DnsRecordProps = {
  /** The domain the records are created for */
  hostname: string;
  /** Fly app that serves it, which the traffic record points at */
  app: string;
  /** What Fly wants for the ownership challenge */
  validation: {
    /** Hostname the record is created for */
    name?: string | null;
    /** What it points at */
    target?: string | null;
    /** Fly's own phrasing, for the cases it describes better than a CNAME row */
    instructions?: string | null;
    /** The domain itself rather than a subdomain, which cannot use a CNAME */
    isApex?: boolean;
    /** The A and AAAA records an apex points at, in place of a CNAME */
    addresses?: Array<{ type: 'A' | 'AAAA'; address: string }>;
  };
  /**
   * Value for the `_fly-ownership` TXT record, when Fly has offered one.
   *
   * Fly's fallback proof of ownership, for the cases where it cannot read the
   * app's address off the domain itself — no IPv6, or a proxy in front.
   */
  ownershipRecord?: string | null;
  /**
   * What Fly's last check found already in place, when one has been run.
   *
   * A record can be exactly what was suggested and still be unconfirmed —
   * this only reflects what Fly itself has seen, not whether the copy above
   * was followed.
   */
  confirmed?: {
    traffic?: boolean | null;
    validation?: boolean | null;
    /** The addresses Fly found the domain resolving to */
    addresses?: Array<string> | null;
  } | null;
  /**
   * The certificate is issued, with no known outstanding issue — true both
   * once a check has run clean and before any check has run at all, not
   * only when a check has actively confirmed the domain.
   *
   * The records themselves stay needed forever — removing one still breaks
   * the domain, certificate or not — only the *voice* changes: instructional
   * ledes read as unfinished work under a green status, so a settled block
   * says what the records are for instead of what to do with them.
   */
  settled?: boolean;
  labels: {
    trafficLede: string;
    validationLede: string;
    ownershipLede: string;
    /** Lede for Fly's prose, which is not always the validation record */
    instructionsLede: string;
    apexNote: string;
    /** Hint shown with the note while the addresses are not yet known */
    apexAddressesPending: string;
    nameHint: string;
    /** The one line a settled block shows instead of the instructional ledes */
    settledLede: string;
    /** Accessible name for the copy button */
    copyRecord: string;
  };
};

/**
 * The dns records the domain's owner has to create, laid out to be copied into
 * a registrar.
 *
 * Two of them, and only one is optional — the reverse of what it looks like
 * from here. The traffic record is what makes the domain answer at all; the
 * challenge record only lets the certificate be issued ahead of it. Showing the
 * challenge alone would let a domain go green while resolving nowhere.
 */
export function DnsRecord({
  hostname,
  app,
  validation,
  ownershipRecord,
  confirmed,
  settled = false,
  labels
}: DnsRecordProps) {
  const { name, target, instructions, isApex } = validation;
  const hasChallenge = Boolean(name && target);
  const addresses = validation.addresses ?? [];
  const confirmedAddresses = new Set(
    (confirmed?.addresses ?? []).map((address) => address.toLowerCase())
  );

  return (
    /* Deliberately not a `Card`: this is a surface nested inside one, and
       `bg-card` on both would flatten the nesting the muted tint exists to
       show. shadcn has no inset-panel primitive to reach for instead. */
    <div className="bg-muted/40 flex flex-col gap-3 rounded-md px-3.5 py-3">
      {settled && <p className="text-muted-foreground">{labels.settledLede}</p>}

      <section className="flex flex-col gap-1.5">
        {!settled && (
          <p className="text-muted-foreground">{labels.trafficLede}</p>
        )}
        {isApex ? (
          // An apex needs addresses rather than a name
          <>
            <p className="text-muted-foreground">{labels.apexNote}</p>
            {addresses.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                {labels.apexAddressesPending}
              </p>
            ) : (
              addresses.map(({ type, address }) => (
                <Record
                  key={`${type}-${address}`}
                  type={type}
                  name={hostname}
                  target={address}
                  copyLabel={labels.copyRecord}
                  confirmed={
                    // Fly's own verdict counts too: a proxied domain or a
                    // differently written v6 never matches the address as text
                    Boolean(confirmed?.traffic) ||
                    confirmedAddresses.has(address.toLowerCase())
                  }
                />
              ))
            )}
          </>
        ) : (
          <Record
            name={hostname}
            target={`${app}.fly.dev`}
            copyLabel={labels.copyRecord}
            confirmed={confirmed?.traffic ?? false}
          />
        )}
      </section>

      {hasChallenge ? (
        <section className="flex flex-col gap-1.5">
          {!settled && (
            <p className="text-muted-foreground">{labels.validationLede}</p>
          )}
          <Record
            name={name ?? ''}
            target={target ?? ''}
            copyLabel={labels.copyRecord}
            confirmed={confirmed?.validation ?? false}
          />
        </section>
      ) : (
        instructions && (
          // Fly falls back to prose when the record is not a plain CNAME, and
          // what it describes there is not always the challenge
          <section className="flex flex-col gap-1.5">
            {!settled && (
              <p className="text-muted-foreground">{labels.instructionsLede}</p>
            )}
            <p className="whitespace-pre-line">{instructions}</p>
          </section>
        )
      )}

      {ownershipRecord && (
        <section className="flex flex-col gap-1.5">
          <p className="text-muted-foreground">{labels.ownershipLede}</p>
          <Record
            type="TXT"
            name={`_fly-ownership.${hostname}`}
            target={ownershipRecord}
            copyLabel={labels.copyRecord}
          />
        </section>
      )}

      {!settled && (
        <p className="text-muted-foreground text-xs">{labels.nameHint}</p>
      )}
    </div>
  );
}

/** One record row, with its value ready to copy */
function Record({
  type = 'CNAME',
  name,
  target,
  copyLabel,
  confirmed
}: {
  type?: 'CNAME' | 'TXT' | 'A' | 'AAAA';
  name: string;
  target: string;
  copyLabel: string;
  /** Whether Fly's last check actually found this one in place */
  confirmed?: boolean;
}) {
  return (
    <div className="relative flex items-start gap-1.5 pr-12">
      {confirmed && (
        <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-(--success-subtle)" />
      )}
      <div className="font-mono text-xs break-all">
        <div>
          {type} {name}
        </div>
        <div className="text-muted-foreground">→ {target}</div>
      </div>
      <CopyButton code={target} label={copyLabel} />
    </div>
  );
}
