'use client';

import type { HostnameCheck } from '@cdwr/fly-node/api';
import type {
  CertificateState,
  RecordJudgement,
  RecordSet,
  ResolverComparison,
  TenantDomain
} from '@codeware/app-cms/feature/domains';
import {
  CERTIFICATE_ACTIONS,
  describeCertificateIssues,
  guessZone,
  judgeRecords,
  registrarName
} from '@codeware/app-cms/feature/domains';
import {
  type DomainAction,
  DomainCard,
  type DomainCertificateStatus,
  DomainDetails,
  type RecordClue,
  type RequiredRecord,
  RestartCard,
  isExpiringSoon
} from '@codeware/app-cms/ui/domains';
import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@codeware/shared/ui/shadcn/components/sheet';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useDocumentInfo, useFormFields, useTranslation } from '@payloadcms/ui';
import { getDataByPath } from 'payload/shared';
import React, { useCallback, useMemo, useState } from 'react';

import { usePayloadSdk } from '../utils/use-payload-sdk';

/** A stored certificate, as it reads back out of the database */
type Stored = NonNullable<TenantDomain['certificate']>;

/** How one domain reads right now, once stored and fresh answers are merged */
type Row = {
  hostname: string;
  app: string;
  certificate: Stored | null;
  /** What Fly resolved for the domain; live, so only known after a check */
  check: HostnameCheck | null;
  /** The endpoint acts on stored rows, so an unsaved one has nothing to act on */
  saved: boolean;
};

const isRateLimited = (until: string | null | undefined) =>
  Boolean(until && new Date(until).getTime() > Date.now());

/**
 * A certificate exists once Fly has told us something about one.
 *
 * Checked against several fields that only come back once a certificate
 * does, rather than trusting `status` alone — a single field coming back
 * empty would misclassify a real certificate as not-requested and hide its
 * check/remove actions, silently rather than with an error.
 */
const wasRequested = (certificate: Stored | null) =>
  Boolean(
    certificate?.status ||
    certificate?.isConfigured ||
    certificate?.rateLimitedUntil ||
    certificate?.dnsValidationHostname
  );

const certificateStatus = (
  certificate: Stored | null
): DomainCertificateStatus => {
  if (!wasRequested(certificate)) {
    return 'not-requested';
  }
  if (certificate?.isConfigured) {
    return 'active';
  }
  return isRateLimited(certificate?.rateLimitedUntil) ? 'paused' : 'pending';
};

/** Keys `busy` per button, so only the one that was pressed spins */
const actionKey = (hostname: string, action: DomainAction) =>
  `${hostname}:${action}`;

/** Distinguishes a machine restart from a per-hostname action in `busy` */
const restartKey = (app: string) => `restart:${app}`;

/** Identifies a row by the pair both endpoints act on */
const domainKey = (hostname: string, app: string) => `${hostname}|${app}`;

type Translate = ReturnType<
  typeof useTranslation<TranslationsObject, TranslationsKeys>
>['t'];

/** Every value a record set holds, CNAME first, as one readable list */
const listRecords = ({ a, aaaa, cname }: RecordSet) =>
  [...cname, ...a, ...aaaa].join(', ');

/**
 * A live judgement as the clue next to its record, in plain words.
 *
 * `null` when there is nothing to say, which is also what a record Fly has
 * confirmed shows: Fly's verdict wins, so the clue only explains a no.
 */
const toClue = (
  t: Translate,
  judgement: RecordJudgement,
  record: { type: string; name: string; target: string },
  blocking?: string | null
): RecordClue | null => {
  switch (judgement.verdict) {
    case 'match':
      return {
        verdict: 'match',
        label: t('domains:verdictMatch'),
        detail: t('domains:verdictMatchDetail')
      };
    case 'mismatch':
      return {
        verdict: 'mismatch',
        label: t('domains:verdictWrong'),
        detail: [
          t('domains:verdictWrongDetail', {
            actual: judgement.actual.join(', '),
            expected: record.target
          }),
          blocking
        ]
          .filter(Boolean)
          .join(' ')
      };
    case 'missing':
      return {
        verdict: 'missing',
        label:
          record.type === 'A'
            ? t('domains:verdictMissingIpv4')
            : record.type === 'AAAA'
              ? t('domains:verdictMissingIpv6')
              : t('domains:verdictMissing'),
        detail: t('domains:verdictMissingDetail', {
          type: record.type,
          name: record.name
        })
      };
    default:
      return null;
  }
};

/**
 * What a domain's card and details sheet show, composed from the stored
 * certificate, Fly's last check and the resolvers, once they were asked.
 *
 * The status and the green ticks stay Fly's own. The resolvers only add
 * clues: why Fly still says no, in words a domain owner can act on.
 */
const composeDomainView = (
  t: Translate,
  row: Row,
  comparison: ResolverComparison | null
) => {
  const { hostname, app, certificate, check } = row;
  const isApex = Boolean(certificate?.isApex);
  const zone = comparison?.nameServers?.zone ?? guessZone(hostname, isApex);
  const addresses = (certificate?.addresses ?? []).filter(
    (entry): entry is { type: 'A' | 'AAAA'; address: string } =>
      Boolean(entry?.address) && (entry?.type === 'A' || entry?.type === 'AAAA')
  );
  const cname = `${app}.fly.dev`;
  const judgement = judgeRecords(comparison, {
    isApex,
    cname,
    addresses,
    challenge: certificate?.dnsValidationTarget
  });
  const confirmedAddresses = new Set(
    [...(check?.aRecords ?? []), ...(check?.aaaaRecords ?? [])].map((address) =>
      address.toLowerCase()
    )
  );

  const nameHelp = (name: string) => {
    const label = registrarName(name, zone);
    return label === '@'
      ? t('domains:nameHelpApex', { name })
      : t('domains:nameHelp', { name, label });
  };

  const records: Array<RequiredRecord> = isApex
    ? addresses.map(({ type, address }) => {
        // Fly's own verdict counts too: a proxied domain or a differently
        // written v6 never matches the address as text
        const confirmed =
          Boolean(check?.dnsConfigured) ||
          confirmedAddresses.has(address.toLowerCase());
        return {
          type,
          registrarName: registrarName(hostname, zone),
          nameHelp: nameHelp(hostname),
          target: address,
          confirmed,
          clue: confirmed
            ? null
            : toClue(t, type === 'A' ? judgement.a : judgement.aaaa, {
                type,
                name: hostname,
                target: address
              })
        };
      })
    : [
        {
          type: 'CNAME',
          registrarName: registrarName(hostname, zone),
          nameHelp: nameHelp(hostname),
          target: cname,
          confirmed: Boolean(check?.dnsConfigured),
          clue: check?.dnsConfigured
            ? null
            : toClue(
                t,
                judgement.traffic,
                { type: 'CNAME', name: hostname, target: cname },
                judgement.blockingAddresses.length
                  ? t('domains:verdictBlocking', { name: hostname })
                  : null
              )
        }
      ];

  const issues = describeCertificateIssues(certificate, check);
  const status = certificateStatus(certificate);
  const awaiting = records.filter((record) => !record.confirmed);

  const nextStep = (() => {
    if (status === 'active') {
      return issues.length ? t('domains:nextStepIssues') : null;
    }
    if (status !== 'pending') {
      return null;
    }
    // An apex whose addresses are not known yet has no records to judge;
    // its pending note already says what to do
    if (!records.length) {
      return t('domains:nextStepCreate', { zone });
    }
    // Fly found every record in place; only the certificate is left
    if (!awaiting.length) {
      return t('domains:nextStepIssuing');
    }
    // The clues read one resolver, so while they disagree a match there
    // says little and a mismatch may already be on its way out
    if (comparison && !comparison.agree) {
      return t('domains:nextStepSpreading');
    }
    if (awaiting.every((record) => record.clue?.verdict === 'match')) {
      return t('domains:nextStepWaitFly');
    }
    // Only name the servers as the place to fix it once a record there is
    // known to be wrong or missing, not merely unknown
    const wrong = awaiting.some(
      (record) =>
        record.clue?.verdict === 'mismatch' ||
        record.clue?.verdict === 'missing'
    );
    return wrong && comparison?.nameServers
      ? t('domains:nextStepNameServers', {
          zone: comparison.nameServers.zone,
          servers: comparison.nameServers.servers.join(', ')
        })
      : t('domains:nextStepCreate', { zone });
  })();

  const challengeName = certificate?.dnsValidationHostname;
  const challengeTarget = certificate?.dnsValidationTarget;
  const challenge: RequiredRecord | null =
    challengeName && challengeTarget
      ? {
          type: 'CNAME',
          registrarName: registrarName(challengeName, zone),
          nameHelp: nameHelp(challengeName),
          target: challengeTarget,
          confirmed: Boolean(check?.acmeDnsConfigured),
          clue: check?.acmeDnsConfigured
            ? null
            : toClue(t, judgement.challenge, {
                type: 'CNAME',
                name: challengeName,
                target: challengeTarget
              })
        }
      : null;

  const ownershipName = `_fly-ownership.${hostname}`;
  const ownership: RequiredRecord | null = check?.dnsVerificationRecord
    ? {
        type: 'TXT',
        registrarName: registrarName(ownershipName, zone),
        nameHelp: nameHelp(ownershipName),
        target: check.dnsVerificationRecord
      }
    : null;

  const wildcardFound = comparison?.wildcard
    ? t('domains:wildcardFound', { values: listRecords(comparison.wildcard) })
    : null;

  return {
    status,
    issues,
    nextStep,
    dns: {
      records,
      pendingNote:
        isApex && !addresses.length ? t('domains:apexAddressesPending') : null,
      note: isApex ? t('domains:apexNote') : t('domains:subdomainNote'),
      wildcard: { advice: t('domains:wildcardAdvice'), found: wildcardFound }
    },
    challenge,
    instructions: certificate?.dnsValidationInstructions ?? null,
    ownership,
    resolvers: comparison
      ? {
          answers: comparison.answers,
          agree: comparison.agree,
          nameServersNote: comparison.nameServers
            ? t('domains:resolversNameServers', {
                zone: comparison.nameServers.zone,
                servers: comparison.nameServers.servers.join(', ')
              })
            : null,
          wildcardNote: wildcardFound,
          negativeCacheNote:
            comparison.negativeCacheTtl === null
              ? null
              : t('domains:resolversNegativeCache', {
                  seconds: comparison.negativeCacheTtl
                })
        }
      : null
  };
};

/**
 * Certificate state and dns instructions for a workspace's custom domains.
 *
 * A custom domain needs two halves, and neither side can finish alone: the
 * platform asks Fly for a certificate, and whoever owns the domain creates the
 * dns records that let it validate. This panel drives the first half and spells
 * out the second — which records to create, and whether Fly can see them yet.
 *
 * It renders what was stored at the last check rather than calling Fly on every
 * page load. The workspace view then keeps working when Fly does not, every
 * call is something a person asked for, and `checked …` says how old the answer
 * is instead of implying it is live.
 *
 * The cards themselves live in `@codeware/app-cms/ui/domains`, where every
 * state can be seen at once in Storybook. This owns the form state, the calls
 * and the translations, and hands them down as plain props.
 *
 * `subject` picks which pair of endpoints to call and, for `'tenant'`, which
 * document's id rides along — `platform-settings` is a singleton, so a
 * `'platform'` call needs none.
 */
export const DomainsPanel: React.FC<{
  language: string;
  subject: 'tenant' | 'platform';
}> = ({ language, subject }) => {
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const { id, data } = useDocumentInfo();
  const { sdk } = usePayloadSdk();
  const fields = useFormFields(([formFields]) => formFields);

  const certificatePath =
    subject === 'tenant'
      ? '/tenant-domain-certificate'
      : '/platform-domain-certificate';
  const restartPath =
    subject === 'tenant'
      ? '/tenant-machine-restart'
      : '/platform-machine-restart';

  /**
   * The live `domains` array, reconstructed from the form's flattened field
   * state rather than read with `useField`.
   *
   * Payload stores an array field's own `value` as its row *count*, not its
   * data — the rows live at `domains.0.hostname` etc, and `forceFullValue`
   * (which would return the real array) is an internal `buildFormState`
   * option the client never gets to set. `getDataByPath` is the same
   * reconstruction Payload's own `getData()` uses internally, and is the
   * documented way to read a full array/blocks value from field state.
   */
  const domains = useMemo(
    () => getDataByPath<Array<TenantDomain>>(fields, 'domains') ?? [],
    [fields]
  );

  /**
   * Answers received since the page loaded.
   *
   * Kept here rather than pushed into the form: the endpoint has already
   * written them, and `setValue` would leave the document looking unsaved over
   * a change nobody made.
   */
  const [fresh, setFresh] = useState<Record<string, CertificateState | null>>(
    {}
  );
  /** Fly's resolution results are live by definition, never stored */
  const [checks, setChecks] = useState<Record<string, HostnameCheck | null>>(
    {}
  );
  /** Public-resolver answers, only ever present for a row someone asked about */
  const [resolvers, setResolvers] = useState<
    Record<string, ResolverComparison | null>
  >({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The domain whose Details sheet is open, if any */
  const [detailsFor, setDetailsFor] = useState<string | null>(null);

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      }),
    [language]
  );

  const formatDate = useCallback(
    (iso: string) => dateFormat.format(new Date(iso)),
    [dateFormat]
  );

  /** Expiry reads as a date rather than a timestamp — the hour is noise here */
  const expiryFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }),
    [language]
  );

  /**
   * Ask the public resolvers what they see for one domain.
   *
   * Separate from `run`: it calls a different endpoint, answers far more
   * slowly, and its result is neither stored nor part of the certificate
   * state the other actions all write back.
   */
  const runResolvers = useCallback(
    async (hostname: string) => {
      setBusy(actionKey(hostname, 'resolvers'));
      setError(null);
      try {
        const response = await sdk.request({
          method: 'POST',
          path: '/domain-dns-comparison',
          json: { hostname }
        });
        const body = (await response.json()) as ResolverComparison & {
          error?: string;
        };
        if (!response.ok) {
          setError(body.error || t('domains:actionFailed'));
          return;
        }
        setResolvers((current) => ({ ...current, [hostname]: body }));
      } catch {
        setError(t('domains:actionFailed'));
      } finally {
        setBusy(null);
      }
    },
    [sdk, t]
  );

  const run = useCallback(
    async (hostname: string, action: DomainAction) => {
      setBusy(actionKey(hostname, action));
      setError(null);
      try {
        const response = await sdk.request({
          method: 'POST',
          path: certificatePath,
          json:
            subject === 'tenant'
              ? { tenant: id, hostname, action }
              : { hostname, action }
        });

        const body = (await response.json()) as {
          certificate?: CertificateState | null;
          check?: HostnameCheck | null;
          error?: string;
        };

        if (!response.ok) {
          // Fly's own wording names rate limits, unknown apps and permission
          // problems far better than anything generic
          setError(body.error || t('domains:actionFailed'));
          return;
        }

        setFresh((current) => ({
          ...current,
          [hostname]: body.certificate ?? null
        }));
        // Every action answers this one: a request and a check both resolve
        // the domain, and a removal makes whatever was resolved before
        // irrelevant
        setChecks((current) => ({
          ...current,
          [hostname]: body.check ?? null
        }));
        // The comparison was judged against the certificate as it was; the
        // action may have changed what the domain should answer, so it would
        // read as current while it no longer is
        setResolvers((current) => {
          const next = { ...current };
          delete next[hostname];
          return next;
        });
      } catch {
        setError(t('domains:actionFailed'));
      } finally {
        setBusy(null);
      }
    },
    [certificatePath, id, sdk, subject, t]
  );

  const runRestart = useCallback(
    async (app: string) => {
      setBusy(restartKey(app));
      setError(null);
      try {
        const response = await sdk.request({
          method: 'POST',
          path: restartPath,
          json: subject === 'tenant' ? { tenant: id, app } : { app }
        });

        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          setError(body.error || t('domains:actionFailed'));
        }
      } catch {
        setError(t('domains:actionFailed'));
      } finally {
        setBusy(null);
      }
    },
    [id, restartPath, sdk, subject, t]
  );

  /**
   * Hostname and app pairs the server already has, which is what makes a row
   * actionable.
   *
   * Read from the document as loaded/last saved rather than the live form
   * state — an in-progress edit should not make a row look actionable before
   * it exists anywhere but this form. The pair is what matters, not the
   * hostname alone: both endpoints act on the stored app, so an edited but
   * unsaved app would act on something other than what the row shows.
   */
  const savedDomains = useMemo(
    () =>
      new Set(
        ((data?.['domains'] as Array<TenantDomain> | undefined) ?? [])
          .filter(
            (
              domain
            ): domain is TenantDomain & { hostname: string; app: string } =>
              Boolean(domain.hostname && domain.app)
          )
          .map((domain) => domainKey(domain.hostname, domain.app))
      ),
    [data]
  );

  const rows: Array<Row> = useMemo(
    () =>
      domains
        .filter(
          (
            domain
          ): domain is TenantDomain & { hostname: string; app: string } =>
            Boolean(domain.hostname && domain.app)
        )
        .map(({ hostname, app, certificate }) => ({
          hostname,
          app,
          certificate:
            hostname in fresh ? fresh[hostname] : (certificate ?? null),
          check: checks[hostname] ?? null,
          saved: savedDomains.has(domainKey(hostname, app))
        })),
    [checks, domains, fresh, savedDomains]
  );

  /** Distinct Fly apps with at least one active certificate */
  const restartableApps = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter((row) => row.saved && row.certificate?.isConfigured)
            .map((row) => row.app)
        )
      ),
    [rows]
  );

  const labels = useMemo(
    () => ({
      active: t('domains:active'),
      pending: t('domains:pending'),
      notRequested: t('domains:notRequested'),
      paused: t('domains:paused'),
      saveFirst: t('domains:saveFirst'),
      request: t('domains:request'),
      check: t('domains:check'),
      remove: t('domains:remove'),
      details: t('domains:details'),
      copyRecord: t('domains:copyRecord'),
      moreInfo: t('domains:moreInfo')
    }),
    [t]
  );

  const detailsLabels = useMemo(
    () => ({
      issuesHeading: t('domains:issuesHeading'),
      issuesActiveHeading: t('domains:issuesActiveHeading'),
      compareResolvers: t('domains:compareResolvers'),
      resolversHeading: t('domains:resolversHeading'),
      resolversAgree: t('domains:resolversAgree'),
      resolversDisagree: t('domains:resolversDisagree'),
      resolversNoAnswer: t('domains:resolversNoAnswer'),
      resolversUnreachable: t('domains:resolversUnreachable'),
      issuedHeading: t('domains:issuedHeading'),
      issuedBy: t('domains:issuedBy'),
      optionalHeading: t('domains:optionalHeading'),
      challengeHelp: t('domains:challengeHelp'),
      ownershipHelp: t('domains:ownershipHelp'),
      instructionsLede: t('domains:dnsLede'),
      copyRecord: t('domains:copyRecord'),
      moreInfo: t('domains:moreInfo')
    }),
    [t]
  );

  const views = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          row.hostname,
          composeDomainView(t, row, resolvers[row.hostname] ?? null)
        ])
      ),
    [resolvers, rows, t]
  );

  if (!rows.length) {
    return null;
  }

  const detailsRow = rows.find((row) => row.hostname === detailsFor);
  const detailsView = detailsRow ? views.get(detailsRow.hostname) : undefined;

  return (
    // Payload's own fields carry their spacing in the admin stylesheet; a
    // custom ui field brings none, so it has to reserve its own room
    <div className="codeware-admin twp mt-2 mb-6 flex flex-col gap-4">
      <h4 className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheckIcon className="size-4" />
        {t('domains:heading')}
      </h4>

      {rows.map((row) => {
        const { certificate } = row;
        const view = views.get(row.hostname);

        return (
          <DomainCard
            key={row.hostname}
            hostname={row.hostname}
            app={row.app}
            status={certificateStatus(certificate)}
            statusDetail={certificate?.status ?? null}
            checkedLabel={
              certificate?.checkedAt
                ? t('domains:checkedAt', {
                    when: formatDate(certificate.checkedAt)
                  })
                : null
            }
            pausedMessage={
              certificate?.rateLimitedUntil
                ? t('domains:rateLimited', {
                    when: formatDate(certificate.rateLimitedUntil)
                  })
                : null
            }
            nextStep={view?.nextStep ?? null}
            dns={certificate ? (view?.dns ?? null) : null}
            saved={row.saved}
            runningAction={
              CERTIFICATE_ACTIONS.find(
                (action) => busy === actionKey(row.hostname, action)
              ) ?? null
            }
            disabled={busy !== null}
            labels={labels}
            onAction={(action) =>
              action === 'details'
                ? setDetailsFor(row.hostname)
                : void run(row.hostname, action)
            }
          />
        );
      })}

      <RestartCard
        apps={restartableApps}
        hint={t('domains:restartHint')}
        restartLabel={t('domains:restart')}
        runningApp={restartableApps.find((app) => busy === restartKey(app))}
        disabled={busy !== null}
        onRestart={(app) => void runRestart(app)}
      />

      {error && (
        <p role="alert" className="text-sm text-(--destructive-subtle)">
          {error}
        </p>
      )}

      {/* One sheet for the panel, showing whichever card asked for it */}
      <Sheet
        open={Boolean(detailsRow)}
        onOpenChange={(open) => !open && setDetailsFor(null)}
      >
        <SheetContent size="lg" className="codeware-admin twp gap-0">
          {detailsRow && detailsView && (
            <>
              <SheetHeader>
                <SheetTitle>{detailsRow.hostname}</SheetTitle>
                <SheetDescription>{t('domains:detailsSub')}</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
                <DomainDetails
                  active={detailsView.status === 'active'}
                  issues={detailsView.issues}
                  resolvers={detailsView.resolvers}
                  issued={(detailsRow.certificate?.issuedCertificates ?? [])
                    .filter(
                      (
                        entry
                      ): entry is {
                        type: string;
                        expiresAt: string;
                        id?: unknown;
                      } => Boolean(entry?.type) && Boolean(entry?.expiresAt)
                    )
                    .map((entry) => ({
                      type: entry.type,
                      expiresLabel: expiryFormat.format(
                        new Date(entry.expiresAt)
                      ),
                      expiringSoon: isExpiringSoon(entry.expiresAt)
                    }))}
                  certificateAuthority={
                    detailsRow.certificate?.certificateAuthority ?? null
                  }
                  challenge={detailsView.challenge}
                  instructions={detailsView.instructions}
                  ownership={detailsView.ownership}
                  comparing={
                    busy === actionKey(detailsRow.hostname, 'resolvers')
                  }
                  disabled={busy !== null}
                  labels={detailsLabels}
                  onCompare={() => void runResolvers(detailsRow.hostname)}
                />
                {/* The sheet covers the panel, so its error shows here too */}
                {error && (
                  <p
                    role="alert"
                    className="text-sm text-(--destructive-subtle)"
                  >
                    {error}
                  </p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default DomainsPanel;
