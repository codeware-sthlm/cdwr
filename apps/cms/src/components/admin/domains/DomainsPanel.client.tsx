'use client';

import type { HostnameCheck } from '@cdwr/fly-node/api';
import type {
  CertificateState,
  ResolverComparison,
  TenantDomain
} from '@codeware/app-cms/feature/domains';
import {
  CERTIFICATE_ACTIONS,
  describeCertificateIssues
} from '@codeware/app-cms/feature/domains';
import {
  type DomainAction,
  DomainCard,
  type DomainCertificateStatus,
  RestartCard,
  isExpiringSoon
} from '@codeware/app-cms/ui/domains';
import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
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
    async (hostname: string, isApex: boolean) => {
      setBusy(actionKey(hostname, 'resolvers'));
      setError(null);
      try {
        const response = await sdk.request({
          method: 'POST',
          path: '/domain-dns-comparison',
          json: { hostname, isApex }
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
      copyRecord: t('domains:copyRecord'),
      dnsLede: t('domains:dnsLede'),
      dnsNameHint: t('domains:dnsNameHint'),
      dnsOwnershipLede: t('domains:dnsOwnershipLede'),
      dnsSettledLede: t('domains:dnsSettledLede'),
      dnsTrafficLede: t('domains:dnsTrafficLede'),
      dnsValidationLede: t('domains:dnsValidationLede'),
      compareResolvers: t('domains:compareResolvers'),
      issuedBy: t('domains:issuedBy'),
      issuedHeading: t('domains:issuedHeading'),
      issuesActiveHeading: t('domains:issuesActiveHeading'),
      issuesHeading: t('domains:issuesHeading'),
      resolversAgree: t('domains:resolversAgree'),
      resolversDisagree: t('domains:resolversDisagree'),
      resolversHeading: t('domains:resolversHeading'),
      resolversNoAnswer: t('domains:resolversNoAnswer'),
      resolversUnreachable: t('domains:resolversUnreachable'),
      apexNote: t('domains:apexNote')
    }),
    [t]
  );

  if (!rows.length) {
    return null;
  }

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
        // Certificate-level prose survives a reload; a live check's codes do
        // not, so this can have something to say even before one is run
        const issues = describeCertificateIssues(certificate, row.check);

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
            issued={(certificate?.issuedCertificates ?? [])
              .filter(
                (
                  entry
                ): entry is { type: string; expiresAt: string; id?: unknown } =>
                  Boolean(entry?.type) && Boolean(entry?.expiresAt)
              )
              .map((entry) => ({
                type: entry.type,
                expiresLabel: expiryFormat.format(new Date(entry.expiresAt)),
                expiringSoon: isExpiringSoon(entry.expiresAt)
              }))}
            certificateAuthority={certificate?.certificateAuthority ?? null}
            dns={
              certificate
                ? {
                    name: certificate.dnsValidationHostname,
                    target: certificate.dnsValidationTarget,
                    instructions: certificate.dnsValidationInstructions,
                    isApex: certificate.isApex ?? false,
                    addresses: (certificate.addresses ?? []).filter(
                      (
                        entry
                      ): entry is { type: 'A' | 'AAAA'; address: string } =>
                        Boolean(entry?.address) &&
                        (entry?.type === 'A' || entry?.type === 'AAAA')
                    )
                  }
                : null
            }
            check={
              row.check || issues.length
                ? {
                    issues,
                    ownershipRecord: row.check?.dnsVerificationRecord ?? null,
                    confirmed: row.check
                      ? {
                          traffic: Boolean(row.check.dnsConfigured),
                          validation: Boolean(row.check.acmeDnsConfigured),
                          addresses: [
                            ...(row.check.aRecords ?? []),
                            ...(row.check.aaaaRecords ?? [])
                          ]
                        }
                      : null
                  }
                : null
            }
            saved={row.saved}
            runningAction={
              CERTIFICATE_ACTIONS.find(
                (action) => busy === actionKey(row.hostname, action)
              ) ?? null
            }
            disabled={busy !== null}
            labels={labels}
            resolvers={(() => {
              const comparison = resolvers[row.hostname];
              if (!comparison) {
                return null;
              }
              return {
                answers: comparison.answers,
                agree: comparison.agree,
                negativeCacheNote:
                  comparison.negativeCacheTtl === null
                    ? null
                    : t('domains:resolversNegativeCache', {
                        seconds: comparison.negativeCacheTtl
                      })
              };
            })()}
            onAction={(action) =>
              action === 'resolvers'
                ? void runResolvers(row.hostname, Boolean(certificate?.isApex))
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
    </div>
  );
};

export default DomainsPanel;
