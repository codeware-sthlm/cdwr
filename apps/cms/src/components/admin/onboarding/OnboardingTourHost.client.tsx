'use client';

import type { FaqTopic } from '@codeware/app-cms/util/definitions';
import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@codeware/shared/ui/shadcn/components/dialog';
import type { User } from '@codeware/shared/util/payload-types';
import { cn } from '@codeware/shared/util/ui';
import { SparklesIcon } from '@heroicons/react/24/outline';
import { useAuth, usePreferences, useTranslation } from '@payloadcms/ui';
import { useRouter } from 'next/navigation';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { openHelp } from '../help-events';
import { usePalette } from '../palette/PaletteProvider.client';

import {
  ONBOARDING_PREFERENCES_KEY,
  type OnboardingPreferences
} from './onboarding-preferences';
import { OPEN_TOUR_EVENT } from './tour-events';
import { TOUR_MORE, type TourShowMe, visibleTourSteps } from './tour-steps';

/**
 * The onboarding tour: a stepped dialog through the five things that get a
 * new editor going, then a closing card with two more.
 *
 * Mounted (invisibly) in the admin actions row, so it opens on any page on
 * {@link OPEN_TOUR_EVENT}: from the command palette, the help drawer, or the
 * dashboard's first visit. Every way out marks the tour as seen.
 */
export function OnboardingTourHost() {
  const { permissions, user } = useAuth<User>();
  const { setPreference } = usePreferences();
  const { openPalette } = usePalette();
  const router = useRouter();
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  // Leaving for another overlay: don't hand focus back to the page behind
  const leaving = useRef(false);

  // Opening never moves the step, so a second open event (the dashboard's,
  // arriving late) leaves an open tour where it is; closing resets it
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_TOUR_EVENT, handler);
    return () => window.removeEventListener(OPEN_TOUR_EVENT, handler);
  }, []);

  if (!user) {
    return null;
  }

  const steps = visibleTourSteps(permissions);
  // The closing card is the last page
  const total = steps.length + 1;
  // Permissions can shrink the list while the tour is open
  const current = Math.min(index, total - 1);
  const step = steps[current];
  const isLast = current === total - 1;

  const close = () => {
    setOpen(false);
    setIndex(0);
    void setPreference<OnboardingPreferences>(
      ONBOARDING_PREFERENCES_KEY,
      { tourSeenAt: new Date().toISOString() },
      true
    );
  };

  const goTo = (next: number) =>
    setIndex(Math.min(Math.max(next, 0), total - 1));

  const showMe = (target: TourShowMe) => {
    close();
    if (target === 'palette') {
      leaving.current = true;
      openPalette();
    } else {
      router.push(target.href);
    }
  };

  const readMore = (topic: FaqTopic) => {
    leaving.current = true;
    close();
    openHelp(topic);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(current + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(current - 1);
    }
  };

  const Icon = step?.icon ?? SparklesIcon;

  return (
    <Dialog
      open={open}
      // Esc, the X and a click outside all count as seen
      onOpenChange={(next) => (next ? setOpen(true) : close())}
    >
      <DialogContent
        className="codeware-admin twp max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-120"
        onKeyDown={onKeyDown}
        onCloseAutoFocus={(event) => {
          if (leaving.current) {
            event.preventDefault();
            leaving.current = false;
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('onboarding:dialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('onboarding:dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-48 flex-col gap-3" aria-live="polite">
          <div className="flex items-center gap-3">
            <span className="bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
              <Icon className="size-5" aria-hidden />
            </span>
            <h3 className="text-foreground text-base font-semibold">
              {t(step ? step.titleKey : 'onboarding:moreTitle')}
            </h3>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            {t(step ? step.bodyKey : 'onboarding:moreBody')}
          </p>

          {step ? (
            <div className="flex flex-wrap gap-2">
              {step.showMe && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => step.showMe && showMe(step.showMe)}
                >
                  {t('onboarding:showMe')}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => readMore(step.topic)}
              >
                {t('onboarding:readMore')}
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {TOUR_MORE.map((more) => (
                <li
                  key={more.topic}
                  className="border-border flex flex-col gap-1 rounded-lg border p-3"
                >
                  <span className="text-foreground font-medium">
                    {t(more.titleKey)}
                  </span>
                  <span className="text-muted-foreground">
                    {t(more.bodyKey)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 self-start"
                    onClick={() => readMore(more.topic)}
                  >
                    {t('onboarding:readMore')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-center gap-1.5">
          {Array.from({ length: total }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={t('onboarding:stepLabel', {
                step: i + 1,
                total
              })}
              aria-current={i === current ? 'step' : undefined}
              onClick={() => goTo(i)}
              className={cn(
                'size-2 rounded-full transition-colors',
                i === current
                  ? 'bg-foreground'
                  : 'bg-muted-foreground/30 hover:bg-muted-foreground/60'
              )}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={close}>
            {t('onboarding:skip')}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={current === 0}
              onClick={() => goTo(current - 1)}
            >
              {t('onboarding:back')}
            </Button>
            <Button
              size="sm"
              onClick={() => (isLast ? close() : goTo(current + 1))}
            >
              {t(isLast ? 'onboarding:finish' : 'onboarding:next')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default OnboardingTourHost;
