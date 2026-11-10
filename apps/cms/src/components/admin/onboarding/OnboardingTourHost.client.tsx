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
import { SparklesIcon } from '@heroicons/react/24/outline';
import { useAuth, usePreferences, useTranslation } from '@payloadcms/ui';
import { cva } from 'class-variance-authority';
import { useRouter } from 'next/navigation';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { openHelp } from '../help-events';
import { usePalette } from '../palette/PaletteProvider.client';

import {
  ONBOARDING_PREFERENCES_KEY,
  type OnboardingPreferences
} from './onboarding-preferences';
import { OPEN_TOUR_EVENT, takePendingTour } from './tour-events';
import {
  TOUR_MORE,
  type TourShowMe,
  type TourTone,
  visibleTourSteps
} from './tour-steps';

/** The step's hue as a soft band behind the heading */
const band = cva(
  'flex flex-col gap-4 px-6 pt-6 pb-5 bg-linear-to-br to-transparent',
  {
    variants: {
      tone: {
        'chart-1': 'from-chart-1/20 via-chart-1/5',
        'chart-2': 'from-chart-2/20 via-chart-2/5',
        'chart-3': 'from-chart-3/20 via-chart-3/5',
        'chart-4': 'from-chart-4/20 via-chart-4/5',
        'chart-5': 'from-chart-5/20 via-chart-5/5',
        primary: 'from-primary/20 via-primary/5'
      } satisfies Record<TourTone, string>
    }
  }
);

/** The icon on a tile in the step's hue */
const tile = cva('flex shrink-0 items-center justify-center', {
  variants: {
    tone: {
      'chart-1': 'bg-chart-1/15 text-chart-1',
      'chart-2': 'bg-chart-2/15 text-chart-2',
      'chart-3': 'bg-chart-3/15 text-chart-3',
      'chart-4': 'bg-chart-4/15 text-chart-4',
      'chart-5': 'bg-chart-5/15 text-chart-5',
      primary: 'bg-primary/15 text-primary'
    } satisfies Record<TourTone, string>,
    size: {
      sm: 'size-10 rounded-lg',
      lg: 'size-14 rounded-2xl'
    }
  }
});

/** Text in the step's hue; the current step dot borrows it as its fill */
const ink = cva('', {
  variants: {
    tone: {
      'chart-1': 'text-chart-1',
      'chart-2': 'text-chart-2',
      'chart-3': 'text-chart-3',
      'chart-4': 'text-chart-4',
      'chart-5': 'text-chart-5',
      primary: 'text-primary'
    } satisfies Record<TourTone, string>
  }
});

/** A step dot: the current one stretches to a pill in the step's hue */
const dot = cva('h-2 rounded-full transition-all', {
  variants: {
    active: {
      true: 'bg-current w-6',
      false: 'bg-muted-foreground/25 hover:bg-muted-foreground/50 w-2'
    }
  }
});

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
    const handler = () => {
      takePendingTour();
      setOpen(true);
    };
    window.addEventListener(OPEN_TOUR_EVENT, handler);
    // The dashboard may have asked before this mounted
    if (takePendingTour()) {
      handler();
    }
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
  const tone: TourTone = step?.tone ?? 'primary';

  return (
    <Dialog
      open={open}
      // Esc, the X and a click outside all count as seen
      onOpenChange={(next) => (next ? setOpen(true) : close())}
    >
      <DialogContent
        className="codeware-admin twp max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-lg"
        onKeyDown={onKeyDown}
        onCloseAutoFocus={(event) => {
          if (leaving.current) {
            event.preventDefault();
            leaving.current = false;
          }
        }}
      >
        <div className={band({ tone })} aria-live="polite">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              {t('onboarding:dialogTitle')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t('onboarding:dialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-4">
            <span className={tile({ tone, size: 'lg' })}>
              <Icon className="size-8" strokeWidth={1.5} aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-muted-foreground text-sm">
                {t('onboarding:stepLabel', { step: current + 1, total })}
              </span>
              <h3 className="text-foreground text-xl font-semibold text-balance">
                {t(step ? step.titleKey : 'onboarding:moreTitle')}
              </h3>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5 px-6 py-5">
          <p className="text-foreground/80 text-base leading-relaxed">
            {t(step ? step.bodyKey : 'onboarding:moreBody')}
          </p>

          {step ? (
            <div className="flex flex-wrap gap-2">
              {step.showMe && (
                <Button
                  variant="outline"
                  onClick={() => step.showMe && showMe(step.showMe)}
                >
                  {t('onboarding:showMe')}
                </Button>
              )}
              <Button variant="ghost" onClick={() => readMore(step.topic)}>
                {t('onboarding:readMore')}
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {TOUR_MORE.map((more) => {
                const MoreIcon = more.icon;
                return (
                  <li
                    key={more.topic}
                    className="border-border flex items-start gap-3 rounded-xl border p-3"
                  >
                    <span className={tile({ tone: more.tone, size: 'sm' })}>
                      <MoreIcon
                        className="size-5"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-foreground text-base font-medium">
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
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
          <Button variant="ghost" onClick={close}>
            {t('onboarding:skip')}
          </Button>
          <div
            className={ink({ tone, className: 'flex items-center gap-1.5' })}
          >
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
                className={dot({ active: i === current })}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={current === 0}
              onClick={() => goTo(current - 1)}
            >
              {t('onboarding:back')}
            </Button>
            <Button onClick={() => (isLast ? close() : goTo(current + 1))}>
              {t(isLast ? 'onboarding:finish' : 'onboarding:next')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default OnboardingTourHost;
