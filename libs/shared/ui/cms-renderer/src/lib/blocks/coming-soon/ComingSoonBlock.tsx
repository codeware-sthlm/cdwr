import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { t } from '@codeware/shared/util/i18n';
import type { ComingSoonBlock as ComingSoonBlockProps } from '@codeware/shared/util/payload-types';
import { formatDayOnlyDate } from '@codeware/shared/util/pure';
import { MailIcon, PhoneIcon } from 'lucide-react';

import { usePayload } from '../../providers/PayloadProvider';
import { Illustration } from '../../utils/Illustration';

import { comingHomeSvg } from './coming-home';

/**
 * Coming soon block — a temporary landing page filling the first screen.
 *
 * A drawing, a badge, a heading, a message, the opening date, a button that
 * opens an overlay form on the same page, and the ways to get in touch. All
 * but the heading are optional.
 */
export const ComingSoonBlock: React.FC<ComingSoonBlockProps> = ({
  badge,
  heading,
  message,
  openingDate,
  contactEmail,
  contactPhone,
  notifyLabel,
  notifyAnchor,
  showIllustration,
  illustration
}) => {
  const { locale, navigate } = usePayload();
  // Whitespace left in a cleared field is not a drawing
  const custom = illustration?.trim() ? illustration : null;
  const opening = formatDayOnlyDate(openingDate, locale);
  const phoneHref = contactPhone?.replace(/[^\d+]/g, '');

  return (
    // Opening the page, it takes the first screen under the 4rem header.
    // Anywhere else, such as the block gallery, it keeps its own height
    <section className="flex flex-col items-center justify-center py-12 text-center in-data-[opens-full]:min-h-[calc(100svh-4rem)]">
      {/* A row from before the field has no value and keeps its drawing */}
      {showIllustration !== false &&
        (custom ? (
          <div className="mb-10 w-full max-w-sm">
            <Illustration svg={custom} />
          </div>
        ) : (
          <div
            className="mb-10 w-full max-w-sm [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: comingHomeSvg }}
          />
        ))}
      {badge && (
        <p className="text-core-link text-sm font-semibold tracking-[0.14em] uppercase">
          {badge}
        </p>
      )}
      <h1 className="text-core-headline mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-balance md:text-6xl">
        {heading}
      </h1>
      {message && (
        <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-relaxed whitespace-pre-line md:text-xl">
          {message}
        </p>
      )}
      {opening && (
        <p className="border-border bg-card mt-8 inline-flex rounded-full border px-4 py-1.5 text-sm font-medium">
          <time dateTime={openingDate ?? undefined}>
            {t(locale, 'comingSoon.opening', { date: opening })}
          </time>
        </p>
      )}
      {notifyLabel && notifyAnchor && (
        <Button
          className="mt-9"
          size="lg"
          onClick={() => navigate(`#${notifyAnchor}`)}
        >
          {notifyLabel}
        </Button>
      )}
      {(contactEmail || contactPhone) && (
        <address className="text-muted-foreground mt-10 flex flex-col items-center gap-2 text-sm not-italic sm:flex-row sm:gap-6">
          <span className="sr-only">{t(locale, 'comingSoon.contact')}</span>
          {contactEmail && (
            <a
              href={`mailto:${contactEmail}`}
              className="hover:text-foreground inline-flex items-center gap-2"
            >
              <MailIcon aria-hidden="true" className="size-4" />
              {contactEmail}
            </a>
          )}
          {contactPhone && (
            <a
              href={`tel:${phoneHref}`}
              className="hover:text-foreground inline-flex items-center gap-2"
            >
              <PhoneIcon aria-hidden="true" className="size-4" />
              {contactPhone}
            </a>
          )}
        </address>
      )}
    </section>
  );
};
