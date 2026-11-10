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
import {
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore
} from 'react';
import { createPortal } from 'react-dom';

import { HELP_CLOSED_EVENT, openHelp } from '../help-events';
import { usePalette } from '../palette/PaletteProvider.client';

import {
  ONBOARDING_PREFERENCES_KEY,
  type OnboardingPreferences
} from './onboarding-preferences';
import { OPEN_TOUR_EVENT, openTour, takePendingTour } from './tour-events';
import { getTourPause, setTourPause, subscribeTourPause } from './tour-pause';
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
 *
 * "Read more" and "Show me" only pause it on its step: it comes back when the
 * help drawer or the palette closes, and on the page "Show me" led to a card
 * offers to continue (see `tour-pause.ts`).
 */
export function OnboardingTourHost() {
  const { permissions, user } = useAuth<User>();
  const { setPreference } = usePreferences();
  const { open: paletteOpen, openPalette } = usePalette();
  const router = useRouter();
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  // Stepped aside for the help drawer or the palette, back when it closes
  const [waitFor, setWaitFor] = useState<'help' | 'palette'>();
  // Left for another page through "Show me": a card there offers to continue
  const pagePause = useSyncExternalStore(
    subscribeTourPause,
    getTourPause,
    () => undefined
  );
  // Leaving for another overlay: don't hand focus back to the page behind
  const leaving = useRef(false);

  // Opening never moves the step, so a second open event (the dashboard's,
  // arriving late) leaves an open tour where it is, and a paused tour resumes
  // where it stood; closing resets it
  useEffect(() => {
    const handler = () => {
      takePendingTour();
      const paused = getTourPause();
      if (paused) {
        setIndex(paused.step);
        setTourPause(undefined);
      }
      setWaitFor(undefined);
      setOpen(true);
    };
    window.addEventListener(OPEN_TOUR_EVENT, handler);
    // The dashboard may have asked before this mounted
    if (takePendingTour()) {
      handler();
    }
    return () => window.removeEventListener(OPEN_TOUR_EVENT, handler);
  }, []);

  // Back from the help drawer
  useEffect(() => {
    if (waitFor !== 'help') {
      return;
    }
    window.addEventListener(HELP_CLOSED_EVENT, openTour);
    return () => window.removeEventListener(HELP_CLOSED_EVENT, openTour);
  }, [waitFor]);

  // Back from the command palette, also when a command left the page
  useEffect(() => {
    if (waitFor === 'palette' && !paletteOpen) {
      openTour();
    }
  }, [waitFor, paletteOpen]);

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

  // Once it has opened, the tour never opens by itself again
  const markSeen = () =>
    void setPreference<OnboardingPreferences>(
      ONBOARDING_PREFERENCES_KEY,
      { tourSeenAt: new Date().toISOString() },
      true
    );

  const close = () => {
    setOpen(false);
    setIndex(0);
    setWaitFor(undefined);
    setTourPause(undefined);
    markSeen();
  };

  // Steps aside, keeping its step
  const stepAside = () => {
    setOpen(false);
    markSeen();
  };

  const goTo = (next: number) =>
    setIndex(Math.min(Math.max(next, 0), total - 1));

  const showMe = (target: TourShowMe) => {
    stepAside();
    if (target === 'palette') {
      leaving.current = true;
      setWaitFor('palette');
      openPalette();
    } else {
      setTourPause({ step: current });
      router.push(target.href);
    }
  };

  const readMore = (topic: FaqTopic) => {
    leaving.current = true;
    stepAside();
    setWaitFor('help');
    openHelp(topic);
  };

  // The card names the step the tour will continue on
  const cardIndex = pagePause && Math.min(pagePause.step, total - 1);
  const cardStep = cardIndex === undefined ? undefined : steps[cardIndex];
  const CardIcon = cardStep?.icon ?? SparklesIcon;

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
    <>
      {cardIndex !== undefined &&
        !open &&
        createPortal(
          // Not modal: the page "Show me" led to stays usable underneath
          <section
            aria-label={t('onboarding:dialogTitle')}
            className="codeware-admin twp bg-background fixed inset-x-4 bottom-4 z-40 flex flex-col gap-3 rounded-xl border p-4 shadow-lg sm:left-auto sm:w-80"
          >
            <div className="flex items-center gap-3">
              <span
                className={tile({
                  tone: cardStep?.tone ?? 'primary',
                  size: 'sm'
                })}
              >
                <CardIcon className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="text-muted-foreground text-sm">
                  {t('onboarding:stepLabel', { step: cardIndex + 1, total })}
                </span>
                <span className="text-foreground text-base font-medium">
                  {t(cardStep ? cardStep.titleKey : 'onboarding:moreTitle')}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={close}>
                {t('onboarding:end')}
              </Button>
              <Button onClick={openTour}>{t('onboarding:resume')}</Button>
            </div>
          </section>,
          document.body
        )}
      <Dialog
        open={open}
        // Esc, the X and a click outside all count as seen
        onOpenChange={(next) => (next ? setOpen(true) : close())}
      >
        {/* One size for every step, so the dialog doesn't jump; the body scrolls when it must */}
        <DialogContent
          className="codeware-admin twp flex h-[min(32rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          onKeyDown={onKeyDown}
          onCloseAutoFocus={(event) => {
            if (leaving.current) {
              event.preventDefault();
              leaving.current = false;
            }
          }}
        >
          <div
            className={band({ tone, className: 'shrink-0' })}
            aria-live="polite"
          >
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

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
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
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-foreground text-base font-medium">
                            {t(more.titleKey)}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="-my-1 -mr-1 shrink-0"
                            onClick={() => readMore(more.topic)}
                          >
                            {t('onboarding:readMore')}
                          </Button>
                        </div>
                        <span className="text-muted-foreground">
                          {t(more.bodyKey)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="bg-muted/40 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
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
    </>
  );
}

export default OnboardingTourHost;
