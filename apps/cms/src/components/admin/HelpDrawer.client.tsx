'use client';

import { type FaqTopic, isFaqTopic } from '@codeware/app-cms/util/definitions';
import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@codeware/shared/ui/shadcn/components/accordion';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle
} from '@codeware/shared/ui/shadcn/components/drawer';
import type { Config, Faq, User } from '@codeware/shared/util/payload-types';
import {
  MapIcon,
  QuestionMarkCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { PayloadSDK } from '@payloadcms/sdk';
import { useAuth, useConfig, useTranslation } from '@payloadcms/ui';
import Link from 'next/link';
import type { TypedLocale } from 'payload';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { groupFaqByTopic } from './faq-groups';
import {
  HELP_CLOSED_EVENT,
  OPEN_HELP_EVENT,
  type OpenHelpDetail
} from './help-events';
import { openTour } from './onboarding/tour-events';

export { OPEN_HELP_EVENT, openHelp } from './help-events';

type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * Toolbar help button (`admin.components.actions`) opening a drawer with
 * FAQ entries fetched from the global `faq` collection in the admin locale.
 *
 * Content is managed by system users in the FAQ collection; they also get
 * a manage link at the bottom of the drawer.
 */
export function HelpDrawer() {
  const { token, user } = useAuth<User>();
  const { config } = useConfig();
  const { i18n, t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const language = i18n.language;

  const sdk = useMemo(
    () =>
      new PayloadSDK<Config>({
        // Same origin as the page, not serverURL (see usePayloadSdk)
        baseURL: config.routes.api,
        baseInit: token ? { headers: { Authorization: `JWT ${token}` } } : {}
      }),
    [config.routes.api, token]
  );

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [faqs, setFaqs] = useState<Array<Faq>>([]);
  // Locale of the latest fetch attempt. A ref rather than state so a failed
  // request (e.g. expired session → 403) is not retried on every render —
  // only when the drawer is reopened or the admin language changes.
  const attemptedLocale = useRef<string>(undefined);

  // Groups open in the outer accordion, and a topic still to scroll into view
  const [openTopics, setOpenTopics] = useState<Array<string>>([]);
  const pendingTopic = useRef<FaqTopic>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  // Let the command palette (or anything else) open the drawer, optionally
  // on one topic. An unknown topic is ignored and opens the drawer as usual.
  useEffect(() => {
    const openDrawer = (event: Event) => {
      const topic = (event as CustomEvent<OpenHelpDetail>).detail?.topic;
      const valid = isFaqTopic(topic) ? topic : undefined;
      setOpenTopics(valid ? [valid] : []);
      pendingTopic.current = valid;
      setOpen(true);
    };
    window.addEventListener(OPEN_HELP_EVENT, openDrawer);
    return () => window.removeEventListener(OPEN_HELP_EVENT, openDrawer);
  }, []);

  // Say when the drawer closes, whichever way: a paused tour comes back then
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) {
      window.dispatchEvent(new CustomEvent(HELP_CLOSED_EVENT));
    }
    wasOpen.current = open;
  }, [open]);

  const groups = useMemo(() => groupFaqByTopic(faqs), [faqs]);

  // Scroll the requested group's heading into view once the entries are
  // rendered. An event that arrives before the fetch finishes just waits in
  // `pendingTopic` until `status` turns `success`. The event also sets state,
  // so the effect reruns for an event that arrives after the load.
  useEffect(() => {
    const topic = pendingTopic.current;
    if (!topic || !open || status !== 'success') {
      return;
    }
    pendingTopic.current = undefined;
    listRef.current
      ?.querySelector(`[data-topic="${topic}"]`)
      ?.scrollIntoView({ block: 'start' });
  }, [open, status, groups, openTopics]);

  // Fetch entries lazily on first open and when the admin language changes
  useEffect(() => {
    if (!open || attemptedLocale.current === language) {
      return;
    }
    attemptedLocale.current = language;
    let cancelled = false;
    let settled = false;
    setStatus('loading');
    sdk
      .find({
        collection: 'faq',
        sort: '_order', // faq is orderable, so use the admin order for display
        limit: 100,
        depth: 0,
        locale: language as TypedLocale<Config>
      })
      .then((result) => {
        settled = true;
        if (cancelled) {
          return;
        }
        setFaqs(result.docs);
        setStatus('success');
      })
      .catch(() => {
        settled = true;
        // Allow a fresh attempt the next time the drawer opens
        attemptedLocale.current = undefined;
        if (!cancelled) {
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
      // Closed while the request was in flight — retry on next open instead
      // of leaving a stale loading state behind
      if (!settled) {
        attemptedLocale.current = undefined;
      }
    };
  }, [sdk, language, open]);

  if (!user) {
    return null;
  }

  return (
    <div className="codeware-admin twp">
      {/* Matches the language/locale pills — see PaletteTrigger for why
       * `outline` and the `sm` label breakpoint were wrong here. */}
      <Button
        onClick={() => setOpen(true)}
        variant="ghost"
        size="sm"
        className="border-border bg-background text-muted-foreground hover:text-foreground h-7 gap-1.5 rounded-full border px-2.5 text-xs font-medium"
        title={t('help:openHelp')}
        aria-label={t('help:drawerTitle')}
      >
        <QuestionMarkCircleIcon className="size-3.5" />
        <span className="max-lg:hidden">{t('help:openHelp')}</span>
      </Button>
      <Drawer open={open} onOpenChange={setOpen} direction="right">
        {/* Floating inset panel: the same-variant overrides replace the base
            edge-anchored classes. `sm:max-w-140` uses the pinned spacing
            scale (560px, room for the grouped FAQ); named rem sizes like
            `max-w-sm` shrink under Payload's 13px root font */}
        {/* `after:hidden` removes vaul's over-drag filler pseudo-element,
            which otherwise paints a solid strip in the floating gap */}
        <DrawerContent className="codeware-admin twp after:hidden data-[vaul-drawer-direction=right]:inset-y-2 data-[vaul-drawer-direction=right]:right-2 data-[vaul-drawer-direction=right]:rounded-xl data-[vaul-drawer-direction=right]:border data-[vaul-drawer-direction=right]:sm:max-w-140">
          <DrawerHeader className="border-border border-b">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <DrawerTitle>{t('help:drawerTitle')}</DrawerTitle>
                <DrawerDescription>
                  {t('help:drawerDescription')}
                </DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="-mt-1 -mr-1"
                  aria-label={t('general:close')}
                >
                  <XMarkIcon className="size-4" aria-hidden />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div ref={listRef} className="flex-1 overflow-y-auto p-6">
            <Button
              variant="outline"
              size="sm"
              className="mb-4 gap-1.5"
              onClick={() => {
                setOpen(false);
                openTour();
              }}
            >
              <MapIcon className="size-4" aria-hidden />
              {t('onboarding:takeTour')}
            </Button>
            {status === 'loading' && (
              <p className="text-muted-foreground text-sm">
                {t('help:loading')}
              </p>
            )}
            {status === 'error' && (
              <p className="text-muted-foreground text-sm">
                {t('help:loadError')}
              </p>
            )}
            {status === 'success' && faqs.length === 0 && (
              <p className="text-muted-foreground text-sm">{t('help:empty')}</p>
            )}
            {status === 'success' && faqs.length > 0 && (
              <Accordion
                type="multiple"
                value={openTopics}
                onValueChange={setOpenTopics}
                className="-mt-2"
              >
                {groups.map(({ topic, entries }) => (
                  <AccordionItem
                    key={topic.value}
                    value={topic.value}
                    data-topic={topic.value}
                  >
                    <AccordionTrigger className="font-semibold">
                      {topic.label[language === 'sv' ? 'sv' : 'en']}
                    </AccordionTrigger>
                    {/* h-auto: a fixed height would clip a question opened inside */}
                    <AccordionContent className="h-auto">
                      {/* w-auto: the base w-full plus ml-1 ran 4px past the
                          topic panel, whose overflow-hidden clipped the text */}
                      <Accordion
                        type="single"
                        collapsible
                        className="border-border ml-1 w-auto border-l pl-4"
                      >
                        {entries.map((faq) => (
                          <AccordionItem key={faq.id} value={String(faq.id)}>
                            <AccordionTrigger>{faq.question}</AccordionTrigger>
                            {/* h-auto here too: a nested panel inherits the
                                topic's content height before measuring its own,
                                which clips a long answer */}
                            <AccordionContent className="h-auto">
                              <p className="text-muted-foreground wrap-break-word whitespace-pre-line">
                                {faq.answer}
                              </p>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>
          {user.role === 'system-user' && (
            <div className="border-border border-t p-6 py-4">
              <Link
                href="/admin/collections/faq"
                className="text-sm text-(--link) hover:underline"
                onClick={() => setOpen(false)}
              >
                {t('help:manageFaq')}
              </Link>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

export default HelpDrawer;
