'use client';

import {
  STARTER_PAGES,
  STARTER_PURPOSES,
  type StarterPage,
  type StarterPurpose
} from '@codeware/app-cms/util/definitions';
import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import type { SiteTheme } from '@codeware/shared/theme';
import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@codeware/shared/ui/shadcn/components/alert';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@codeware/shared/ui/shadcn/components/card';
import { Checkbox } from '@codeware/shared/ui/shadcn/components/checkbox';
import { Label } from '@codeware/shared/ui/shadcn/components/label';
import {
  RadioGroup,
  RadioGroupItem
} from '@codeware/shared/ui/shadcn/components/radio-group';
import { useTranslation } from '@payloadcms/ui';
import { TriangleAlertIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type ThemeChoice = {
  name: SiteTheme;
  label: string;
  /** The theme's resolved primary colour, for the swatch */
  primary: string;
};

const LAST_STEP = 4;

type Outcome = 'idle' | 'failed' | 'has-pages';

const PURPOSE_KEYS = {
  business: {
    label: 'firstSite:purposeBusiness',
    hint: 'firstSite:purposeBusinessHint'
  },
  portfolio: {
    label: 'firstSite:purposePortfolio',
    hint: 'firstSite:purposePortfolioHint'
  },
  association: {
    label: 'firstSite:purposeAssociation',
    hint: 'firstSite:purposeAssociationHint'
  }
} as const satisfies Record<
  StarterPurpose,
  { label: TranslationsKeys; hint: TranslationsKeys }
>;

const PAGE_KEYS = {
  about: { label: 'firstSite:pageAbout', hint: 'firstSite:pageAboutHint' },
  contact: {
    label: 'firstSite:pageContact',
    hint: 'firstSite:pageContactHint'
  },
  news: { label: 'firstSite:pageNews', hint: 'firstSite:pageNewsHint' },
  privacy: {
    label: 'firstSite:pagePrivacy',
    hint: 'firstSite:pagePrivacyHint'
  }
} as const satisfies Record<
  StarterPage,
  { label: TranslationsKeys; hint: TranslationsKeys }
>;

const isPurpose = (value: string): value is StarterPurpose =>
  STARTER_PURPOSES.some((purpose) => purpose === value);

const isTheme = (
  value: string,
  themes: ReadonlyArray<ThemeChoice>
): value is SiteTheme => themes.some((theme) => theme.name === value);

/**
 * The first-site guide: four short steps that end in a starter site.
 *
 * Only answers are sent. The server builds the site from them, and decides
 * again whether this workspace may have one.
 */
export function FirstSite({
  adminRoute,
  state,
  tenantName,
  themes
}: {
  adminRoute: string;
  state: 'available' | 'has-pages' | 'unavailable';
  tenantName: string;
  themes: ReadonlyArray<ThemeChoice>;
}) {
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [purpose, setPurpose] = useState<StarterPurpose>('business');
  const [pages, setPages] = useState<ReadonlyArray<StarterPage>>(STARTER_PAGES);
  const [theme, setTheme] = useState<SiteTheme>(themes[0]?.name ?? 'frost');
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>('idle');

  const dashboard = (
    <Button asChild variant="outline" size="sm">
      <Link href={adminRoute}>{t('firstSite:backToDashboard')}</Link>
    </Button>
  );

  if (state !== 'available' || outcome === 'has-pages') {
    const hasPages = state === 'has-pages' || outcome === 'has-pages';
    return (
      <div className="codeware-admin twp mx-auto max-w-2xl p-8">
        <Alert>
          <AlertTitle>
            {t(
              hasPages
                ? 'firstSite:hasPagesTitle'
                : 'firstSite:unavailableTitle'
            )}
          </AlertTitle>
          <AlertDescription>
            <p>
              {t(
                hasPages
                  ? 'firstSite:hasPagesBody'
                  : 'firstSite:unavailableBody'
              )}
            </p>
            <div className="mt-3">{dashboard}</div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const selectedTheme = themes.find((choice) => choice.name === theme);

  const togglePage = (page: StarterPage, checked: boolean) =>
    // Kept in the catalogue's order, so the summary and the request read alike
    setPages(
      STARTER_PAGES.filter((p) => (p === page ? checked : pages.includes(p)))
    );

  const create = async () => {
    setPending(true);
    setOutcome('idle');

    try {
      const response = await fetch('/api/first-site', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose, pages, theme })
      });

      if (response.status === 409) {
        setOutcome('has-pages');
        setPending(false);
        return;
      }
      if (response.status !== 201) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const body: unknown = await response.json();
      const homePageId =
        typeof body === 'object' &&
        body !== null &&
        'homePageId' in body &&
        (typeof body.homePageId === 'number' ||
          typeof body.homePageId === 'string')
          ? body.homePageId
          : null;

      // The page stays disabled while the browser navigates away
      router.push(
        homePageId === null
          ? `${adminRoute}/collections/pages`
          : `${adminRoute}/collections/pages/${homePageId}`
      );
    } catch {
      setOutcome('failed');
      setPending(false);
    }
  };

  return (
    <div className="codeware-admin twp mx-auto max-w-2xl p-8">
      <Card variant="bordered">
        <CardHeader>
          <p className="text-muted-foreground text-xs font-medium">
            {t('firstSite:stepOf', { step, total: LAST_STEP })}
          </p>
          <CardTitle className="text-xl">{t('firstSite:heading')}</CardTitle>
          <CardDescription>
            {t('firstSite:siteName', { name: tenantName })}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {step === 1 && (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-sm font-medium">
                {t('firstSite:purposeTitle')}
              </legend>
              <RadioGroup
                value={purpose}
                onValueChange={(value) => isPurpose(value) && setPurpose(value)}
              >
                {STARTER_PURPOSES.map((option) => (
                  <Label
                    key={option}
                    htmlFor={`purpose-${option}`}
                    className="border-border has-data-checked:border-primary flex cursor-pointer items-start gap-3 rounded-lg border p-3"
                  >
                    <RadioGroupItem value={option} id={`purpose-${option}`} />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">
                        {t(PURPOSE_KEYS[option].label)}
                      </span>
                      <span className="text-muted-foreground text-sm font-normal">
                        {t(PURPOSE_KEYS[option].hint)}
                      </span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>
          )}

          {step === 2 && (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-sm font-medium">
                {t('firstSite:pagesTitle')}
              </legend>
              <div className="border-border flex items-start gap-3 rounded-lg border p-3">
                <Checkbox id="page-home" checked disabled />
                <Label
                  htmlFor="page-home"
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="text-sm font-medium">
                    {t('firstSite:pageHome')}
                  </span>
                  <span className="text-muted-foreground text-sm font-normal">
                    {t('firstSite:pageHomeHint')}
                  </span>
                </Label>
              </div>
              {STARTER_PAGES.map((page) => (
                <div
                  key={page}
                  className="border-border flex items-start gap-3 rounded-lg border p-3"
                >
                  <Checkbox
                    id={`page-${page}`}
                    checked={pages.includes(page)}
                    onCheckedChange={(checked) =>
                      togglePage(page, checked === true)
                    }
                  />
                  <Label
                    htmlFor={`page-${page}`}
                    className="flex flex-col items-start gap-0.5"
                  >
                    <span className="text-sm font-medium">
                      {t(PAGE_KEYS[page].label)}
                    </span>
                    <span className="text-muted-foreground text-sm font-normal">
                      {t(PAGE_KEYS[page].hint)}
                    </span>
                  </Label>
                </div>
              ))}
            </fieldset>
          )}

          {step === 3 && (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-sm font-medium">
                {t('firstSite:themeTitle')}
              </legend>
              <RadioGroup
                value={theme}
                onValueChange={(value) =>
                  isTheme(value, themes) && setTheme(value)
                }
                className="grid-cols-2 sm:grid-cols-3"
              >
                {themes.map((choice) => (
                  <Label
                    key={choice.name}
                    htmlFor={`theme-${choice.name}`}
                    className="border-border has-data-checked:border-primary flex cursor-pointer items-center gap-3 rounded-lg border p-3"
                  >
                    <RadioGroupItem
                      value={choice.name}
                      id={`theme-${choice.name}`}
                    />
                    <span className="flex-1 text-sm font-medium">
                      {choice.label}
                    </span>
                    <span
                      role="img"
                      aria-label={choice.primary}
                      className="border-border size-5 shrink-0 rounded-full border"
                      style={{ background: choice.primary }}
                    />
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-medium">
                {t('firstSite:summaryTitle')}
              </h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted-foreground">
                  {t('firstSite:summarySite')}
                </dt>
                <dd>{tenantName}</dd>
                <dt className="text-muted-foreground">
                  {t('firstSite:summaryPurpose')}
                </dt>
                <dd>{t(PURPOSE_KEYS[purpose].label)}</dd>
                <dt className="text-muted-foreground">
                  {t('firstSite:summaryPages')}
                </dt>
                <dd>
                  {[
                    t('firstSite:pageHome'),
                    ...pages.map((page) => t(PAGE_KEYS[page].label))
                  ].join(', ')}
                </dd>
                <dt className="text-muted-foreground">
                  {t('firstSite:summaryTheme')}
                </dt>
                <dd className="flex items-center gap-2">
                  {selectedTheme && (
                    <span
                      aria-hidden
                      className="border-border size-4 rounded-full border"
                      style={{ background: selectedTheme.primary }}
                    />
                  )}
                  {selectedTheme?.label ?? theme}
                </dd>
              </dl>
              <p className="text-muted-foreground text-sm">
                {t('firstSite:summaryNote')}
              </p>

              {outcome === 'failed' && (
                <Alert variant="destructive">
                  <TriangleAlertIcon className="size-4" />
                  <AlertTitle>{t('firstSite:errorTitle')}</AlertTitle>
                  <AlertDescription>
                    <p>{t('firstSite:errorBody')}</p>
                    <Button
                      className="mt-3"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={create}
                    >
                      {t('firstSite:retry')}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter className="justify-between">
          <Button
            variant="ghost"
            disabled={step === 1 || pending}
            onClick={() => setStep((current) => Math.max(1, current - 1))}
          >
            {t('firstSite:back')}
          </Button>
          {step < LAST_STEP ? (
            <Button
              onClick={() =>
                setStep((current) => Math.min(LAST_STEP, current + 1))
              }
            >
              {t('firstSite:next')}
            </Button>
          ) : (
            <Button disabled={pending} onClick={create}>
              {t(pending ? 'firstSite:creating' : 'firstSite:create')}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
