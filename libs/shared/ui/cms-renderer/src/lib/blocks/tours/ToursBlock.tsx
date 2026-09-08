'use client';

import { Badge } from '@codeware/shared/ui/shadcn/components/badge';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from '@codeware/shared/ui/shadcn/components/card';
import { t } from '@codeware/shared/util/i18n';
import type {
  Tour,
  ToursBlock as ToursBlockProps
} from '@codeware/shared/util/payload-types';
import { cn } from '@codeware/shared/util/ui';
import { CalendarIcon, ClockIcon } from 'lucide-react';

import { usePayload } from '../../providers/PayloadProvider';
import { handleAsRoute } from '../../utils/internal-link';
import {
  formatPrice,
  formatTourDate,
  resolveTourHero
} from '../../utils/tour-format';
import { ImageBlock } from '../image/ImageBlock';

type Props = ToursBlockProps & {
  /**
   * Pre-fetched tours to render.
   * The app is responsible for fetching these server-side.
   */
  tours: Array<Tour>;
};

/**
 * Renders a listing of tours as cards.
 *
 * Tours are pre-fetched server-side and passed in via the `tours` prop.
 * The block is configured via the Payload `tours` block fields (title, description, limit).
 *
 * The card is one link end to end — the title anchor is stretched over the whole
 * card — so there is a single focal point per card and the facts below stay quiet.
 */
export function ToursBlock({ title, description, tours }: Props) {
  const { locale, navigate } = usePayload();

  if (!tours.length) {
    return null;
  }

  return (
    <section>
      <header className="max-w-2xl">
        <h1 className="text-core-headline text-4xl font-bold tracking-tight sm:text-5xl">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-6 text-base">{description}</p>
        )}
      </header>
      <div className="mt-12 grid grid-cols-1 gap-6 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3">
        {tours.map((tour) => {
          const heroImage = resolveTourHero(tour.heroImage);
          // A tour that will only queue you is worth knowing before clicking
          // in and filling out a form — and a queue is not the same as sold out
          const badge = tour.signupsFull
            ? t(locale, 'tours.badgeFull')
            : tour.signupsQueueOnly
              ? t(locale, 'tours.badgeQueue')
              : null;

          return (
            <Card
              key={tour.id}
              className={cn(
                'group/tour bg-card/50 hover:bg-card focus-within:ring-core-link/40 relative h-full transition-colors duration-300 ease-in-out focus-within:ring-2',
                heroImage && 'pt-0'
              )}
            >
              {heroImage && (
                <div className="[&_img]:aspect-3/2 [&_img]:w-full [&_img]:object-cover">
                  <ImageBlock media={heroImage} hideCaption />
                </div>
              )}
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-core-link text-xs font-semibold tracking-[0.14em] uppercase">
                    {tour.destination}
                  </p>
                  {badge && (
                    <Badge variant="secondary" className="shrink-0">
                      {badge}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-card-foreground text-base">
                  <a
                    href={`/tours/${tour.slug}`}
                    onClick={(e) => {
                      if (!handleAsRoute(e)) return;
                      navigate(`/tours/${tour.slug}`);
                    }}
                    // Stretched over the card so the whole card is the hit area,
                    // while the anchor stays the single focusable element
                    className="group-hover/tour:underline after:absolute after:inset-0 after:rounded-xl focus-visible:outline-hidden"
                  >
                    {tour.title}
                  </a>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-muted-foreground line-clamp-3 text-sm leading-relaxed">
                  {tour.summary}
                </p>
              </CardContent>
              <CardFooter className="justify-between gap-4">
                <div className="text-muted-foreground flex flex-col gap-1 text-xs">
                  <span className="flex items-center gap-1.5">
                    <CalendarIcon
                      className="size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    {formatTourDate(tour.departureDate, locale) ||
                      tour.departureNote ||
                      t(locale, 'tours.datesToBeConfirmed')}
                  </span>
                  {tour.duration && (
                    <span className="flex items-center gap-1.5">
                      <ClockIcon
                        className="size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      {tour.duration}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-card-foreground text-sm font-medium">
                    {formatPrice(tour.price, tour.currency, locale)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t(locale, 'tours.perPerson')}
                  </p>
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
