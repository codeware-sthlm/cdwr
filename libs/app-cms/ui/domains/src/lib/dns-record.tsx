import { CopyButton } from '@codeware/shared/ui/copy-button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@codeware/shared/ui/shadcn/components/popover';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  MinusCircleIcon
} from '@heroicons/react/24/outline';

/**
 * The admin's styling scope. A popover portals out of the panel, so it has to
 * carry the scope itself, as the admin's sheets and menus do.
 */
const PORTAL_SCOPE = 'codeware-admin twp';

/**
 * What public dns answers for a record now, as a clue next to it.
 *
 * Never a verdict: whether the domain is set up is Fly's call, so a `match`
 * reads as "answers as expected", not as done.
 */
export type RecordClue = {
  verdict: 'match' | 'mismatch' | 'missing';
  /** Plain words, e.g. "Points at the wrong server" */
  label: string;
  /** The sentence behind it, e.g. "Answers 46.30.213.129, should be …" */
  detail: string;
};

/** One record the domain's owner creates, as a registrar's form wants it */
export type RequiredRecord = {
  type: 'CNAME' | 'TXT' | 'A' | 'AAAA';
  /** The name relative to the zone: `@` for the domain itself, else `www` */
  registrarName: string;
  /** What the name field takes and why, behind the name's popover */
  nameHelp: string;
  target: string;
  /** Whether Fly's last check found it in place, which is what counts */
  confirmed?: boolean;
  /** What public dns answers, once resolvers have been compared */
  clue?: RecordClue | null;
};

export type DnsRecordProps = {
  /** The records the domain needs, in the order they are created */
  records: Array<RequiredRecord>;
  /** Shown in place of the records while they cannot be known yet */
  pendingNote?: string | null;
  /** Why these records and not others, behind the block's info icon */
  note?: string | null;
  /** What to do with a `*` record, and what one answers when it was found */
  wildcard: {
    advice: string;
    /** Pre-composed "A * record answers …", only once one was found */
    found?: string | null;
  };
  labels: {
    /** Accessible name for the copy button */
    copyRecord: string;
    /** Accessible name for an info icon */
    moreInfo: string;
  };
};

/**
 * The dns records the domain needs, laid out to be copied into a registrar.
 *
 * Only what has to be created: the traffic record, which is what makes the
 * domain answer at all. Optional records and every explanation sit one tap
 * away, so the records themselves are what the eye lands on.
 */
export function DnsRecord({
  records,
  pendingNote,
  note,
  wildcard,
  labels
}: DnsRecordProps) {
  return (
    /* Deliberately not a `Card`: this is a surface nested inside one, and
       `bg-card` on both would flatten the nesting the muted tint exists to
       show. shadcn has no inset-panel primitive to reach for instead. */
    <div className="bg-muted/40 relative flex flex-col gap-2 rounded-md px-3.5 py-3">
      {note && (
        <span className="absolute top-2 right-2">
          <InfoPopover label={labels.moreInfo}>{note}</InfoPopover>
        </span>
      )}

      {pendingNote ? (
        <p className="text-muted-foreground pr-6 text-xs">{pendingNote}</p>
      ) : (
        records.map((record) => (
          <RecordRow
            key={`${record.type}-${record.target}`}
            record={record}
            labels={labels}
          />
        ))
      )}

      <div className="text-muted-foreground flex items-center gap-1 text-xs">
        {wildcard.found && <span>{wildcard.found}</span>}
        <InfoPopover label={labels.moreInfo} trigger="*">
          {wildcard.advice}
        </InfoPopover>
      </div>
    </div>
  );
}

/** One record row, with its value ready to copy */
export function RecordRow({
  record,
  labels
}: {
  record: RequiredRecord;
  labels: DnsRecordProps['labels'];
}) {
  const { type, registrarName, nameHelp, target, confirmed, clue } = record;

  return (
    <div className="relative flex items-start gap-1.5 pr-12">
      <span className="mt-0.5 size-4 shrink-0">
        {confirmed ? (
          // Fly's own verdict, the only one that marks a record done
          <CheckCircleIcon className="size-4 text-(--success-subtle)" />
        ) : clue ? (
          <ClueIcon clue={clue} />
        ) : null}
      </span>
      <div className="font-mono text-xs break-all">
        <div>
          {type}{' '}
          <Popover>
            <PopoverTrigger className="cursor-help underline decoration-dotted underline-offset-2">
              {registrarName}
            </PopoverTrigger>
            <PopoverContent className={`${PORTAL_SCOPE} font-sans text-xs`}>
              {nameHelp}
            </PopoverContent>
          </Popover>
        </div>
        <div className="text-muted-foreground">→ {target}</div>
      </div>
      <CopyButton code={target} label={labels.copyRecord} />
    </div>
  );
}

/** A live clue as one icon, whose popover says it in full */
function ClueIcon({ clue }: { clue: RecordClue }) {
  const Icon =
    clue.verdict === 'match'
      ? CheckCircleIcon
      : clue.verdict === 'missing'
        ? MinusCircleIcon
        : ExclamationTriangleIcon;
  const tone =
    clue.verdict === 'match'
      ? 'text-muted-foreground'
      : 'text-(--warning-subtle)';

  return (
    <Popover>
      <PopoverTrigger aria-label={clue.label} className="cursor-help">
        <Icon className={`size-4 ${tone}`} />
      </PopoverTrigger>
      <PopoverContent className={`${PORTAL_SCOPE} text-xs`}>
        <p className="font-medium">{clue.label}</p>
        <p className="text-muted-foreground">{clue.detail}</p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A short explanation one tap away from what it explains.
 *
 * A popover rather than a tooltip, since a tooltip never opens on a touch
 * screen.
 */
export function InfoPopover({
  label,
  trigger,
  children
}: {
  label: string;
  /** Text to show beside the icon, e.g. `*` */
  trigger?: string;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className="text-muted-foreground inline-flex cursor-help items-center gap-0.5"
      >
        {trigger && <span className="font-mono">{trigger}</span>}
        <InformationCircleIcon className="size-4" />
      </PopoverTrigger>
      <PopoverContent className={`${PORTAL_SCOPE} text-xs`}>
        {children}
      </PopoverContent>
    </Popover>
  );
}
