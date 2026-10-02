import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@codeware/shared/ui/shadcn/components/collapsible';
import { cn } from '@codeware/shared/util/ui';
import { cva } from 'class-variance-authority';
import {
  ChevronsUpDownIcon,
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  LoaderCircleIcon,
  TriangleAlertIcon
} from 'lucide-react';
import { type ComponentType, useState } from 'react';

import { formatPosition } from './build-state';
import type { BuildDiagnostic } from './build-state';
import type { Listed } from './findings';
import type { Tone } from './last-action';
import { type StripModel, formatAgo, formatBuiltAt } from './strip';

const stripVariants = cva('rounded-md border', {
  variants: {
    tone: {
      muted: 'border-border',
      ok: 'border-border',
      warn: 'border-(--warning-subtle)/40 bg-(--warning-subtle)/5',
      error: 'border-destructive/40 bg-destructive/5'
    }
  }
});

const toneText = cva('', {
  variants: {
    tone: {
      muted: 'text-muted-foreground',
      ok: 'text-(--success-subtle)',
      warn: 'text-(--warning-subtle)',
      error: 'text-(--destructive-subtle)'
    }
  }
});

const TONE_ICONS = {
  muted: InfoIcon,
  ok: CircleCheckIcon,
  warn: TriangleAlertIcon,
  error: CircleXIcon
} as const satisfies Record<Tone, ComponentType<{ className?: string }>>;

const FINDING_ORIGINS = {
  check: 'From the last check',
  build: 'From the stored build'
} as const satisfies Record<Listed['origin'], string>;

type Props = {
  model: StripModel;
  /** Whether a task is running, which the action text is then about */
  busy: boolean;
  findings: Listed | null;
  /** Whether a check has run since the source last changed */
  checked: boolean;
  onReveal: (line: number, column: number) => void;
};

const Finding = ({
  diagnostic,
  onReveal
}: {
  diagnostic: BuildDiagnostic;
  onReveal: Props['onReveal'];
}) => {
  const Icon = TONE_ICONS[diagnostic.severity === 'error' ? 'error' : 'warn'];
  const position = formatPosition(diagnostic);
  const text = (
    <>
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          toneText({ tone: diagnostic.severity === 'error' ? 'error' : 'warn' })
        )}
      />
      {position && (
        <span className="text-muted-foreground shrink-0">{position}</span>
      )}
      <span className="whitespace-pre-wrap">{diagnostic.message}</span>
    </>
  );

  return (
    <li>
      {diagnostic.line > 0 ? (
        <button
          type="button"
          onClick={() => onReveal(diagnostic.line, diagnostic.column)}
          className="hover:bg-foreground/5 focus-visible:ring-ring/50 flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left outline-hidden focus-visible:ring-2"
        >
          {text}
        </button>
      ) : (
        <div className="flex items-start gap-2.5 px-2 py-1.5">{text}</div>
      )}
    </li>
  );
};

/**
 * Where things stand, above the toolbar.
 *
 * The bar is the build, which is always there. The small line under it is the
 * session: what the last action did. Findings and the lines an action adds
 * fold out below, and the fold only exists when there is something in it.
 */
export const StatusStrip = ({
  model,
  busy,
  findings,
  checked,
  onReveal
}: Props) => {
  const [open, setOpen] = useState(model.expand);
  const [wasExpanding, setWasExpanding] = useState(model.expand);

  // Opens when something goes wrong and closes again once it is put right
  if (model.expand !== wasExpanding) {
    setWasExpanding(model.expand);
    setOpen(model.expand);
  }

  const actionTone = model.action?.tone ?? 'muted';
  const ActionIcon = busy ? LoaderCircleIcon : TONE_ICONS[actionTone];
  const details = model.action?.details ?? [];
  const listed = findings?.diagnostics ?? [];
  const hasMore = details.length > 0 || listed.length > 0;

  const ago = model.builtAt ? formatAgo(model.builtAt, Date.now()) : null;
  const BuildIcon = model.inFlight
    ? LoaderCircleIcon
    : TONE_ICONS[model.badge.tone];

  return (
    <Collapsible
      open={hasMore && open}
      onOpenChange={setOpen}
      data-slot="studio-status"
      data-tone={model.tone}
      className="flex flex-col gap-2 text-sm"
    >
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3',
          stripVariants({ tone: model.badge.tone })
        )}
      >
        <BuildIcon
          className={cn(
            'size-4 shrink-0',
            toneText({ tone: model.badge.tone }),
            model.inFlight && 'animate-spin'
          )}
        />
        <span className="font-medium">{model.badge.label}</span>
        <span className="text-muted-foreground min-w-0 flex-1">
          {model.summary}
        </span>
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          {model.meta && <span>{model.meta}</span>}
          {model.meta && (model.hash || ago) && <span aria-hidden>·</span>}
          {model.hash && <code>{model.hash}</code>}
          {model.hash && ago && <span aria-hidden>·</span>}
          {ago && model.builtAt && (
            <time
              dateTime={model.builtAt}
              title={formatBuiltAt(model.builtAt)}
              suppressHydrationWarning
            >
              {ago}
            </time>
          )}
        </span>
      </div>

      {/* Padded and bordered as the bar is, so the two icons share a line */}
      <div className="flex min-h-7 items-center justify-between gap-4 border border-transparent pr-1 pl-4">
        <span
          role="status"
          aria-live="polite"
          className={cn(
            'flex min-w-0 items-center gap-3 font-mono text-xs',
            toneText({ tone: actionTone })
          )}
        >
          {model.action ? (
            <>
              <ActionIcon
                className={cn('size-4 shrink-0', busy && 'animate-spin')}
              />
              <span className="truncate">{model.action.text}</span>
            </>
          ) : (
            <span className="truncate">
              {checked
                ? 'The last check found no problems.'
                : 'Nothing checked in this session yet.'}
            </span>
          )}
        </span>
        {hasMore && (
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="xs">
              {open ? 'Hide details' : 'Show details'}
              <ChevronsUpDownIcon />
            </Button>
          </CollapsibleTrigger>
        )}
      </div>

      <CollapsibleContent className="flex flex-col gap-2">
        {details.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1.5 rounded-md border px-4 py-3">
            {details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}

        {findings && listed.length > 0 && (
          <section className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-md border px-4 py-3">
            <h3 className="text-muted-foreground m-0 text-xs font-medium tracking-wide uppercase">
              {FINDING_ORIGINS[findings.origin]}
            </h3>
            <ul className="m-0 -mx-2 flex list-none flex-col p-0 font-mono text-[0.8rem] leading-5">
              {listed.map((diagnostic, index) => (
                <Finding
                  key={`${diagnostic.line}:${diagnostic.column}:${index}`}
                  diagnostic={diagnostic}
                  onReveal={onReveal}
                />
              ))}
            </ul>
          </section>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};
