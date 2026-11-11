import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@codeware/shared/ui/shadcn/components/alert';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

type Answers = { a: Array<string>; aaaa: Array<string>; cname: Array<string> };

export type ResolverReportProps = {
  /** One row per resolver, in the order they were asked */
  answers: Array<{
    resolver: string;
    records: Answers;
    /** The challenge name's CNAME */
    challenge: Array<string>;
    error?: string;
  }>;
  /** Whether every resolver that answered said the same thing */
  agree: boolean;
  /** Pre-composed "DNS for kajstroberg.se is served by …", when it is known */
  nameServersNote?: string | null;
  /** Pre-composed "A * record answers …", when the zone has one */
  wildcardNote?: string | null;
  /** Pre-composed sentence naming the negative-cache window, when it is known */
  negativeCacheNote?: string | null;
  labels: {
    heading: string;
    /** What agreement means: the problem is on the asker's side */
    agreeLede: string;
    /** What disagreement means: mid-propagation, wait it out */
    disagreeLede: string;
    /** Shown for a resolver that has no record yet */
    noAnswer: string;
    /** Shown for a resolver that could not be reached at all */
    unreachable: string;
  };
};

/** One resolver's answer as `CNAME x · A 1.2.3.4 · AAAA …`, raw as dns has it */
const describe = (records: Answers, challenge: Array<string>) =>
  [
    ['CNAME', records.cname],
    ['A', records.a],
    ['AAAA', records.aaaa],
    ['_acme-challenge CNAME', challenge]
  ]
    .filter(([, values]) => values.length)
    .map(([type, values]) => `${type} ${(values as Array<string>).join(', ')}`);

/**
 * What each public resolver says about the domain right now.
 *
 * The point is not what any single resolver returns — it is whether they
 * differ. All three agreeing while a browser still cannot reach the domain
 * places the stale copy on the asker's own side, which is the one conclusion
 * no amount of staring at the records will produce. Where the domain is
 * served comes first, since records created anywhere else never show here.
 */
export function ResolverReport({
  answers,
  agree,
  nameServersNote,
  wildcardNote,
  negativeCacheNote,
  labels
}: ResolverReportProps) {
  if (!answers.length) {
    return null;
  }

  return (
    <Alert variant="default">
      {agree ? <CheckCircleIcon /> : <ExclamationTriangleIcon />}
      <AlertTitle>{labels.heading}</AlertTitle>
      <AlertDescription>
        {nameServersNote && <p>{nameServersNote}</p>}
        <p>{agree ? labels.agreeLede : labels.disagreeLede}</p>
        <ul className="flex w-full flex-col gap-1">
          {answers.map((answer) => {
            const lines = describe(answer.records, answer.challenge);
            return (
              <li
                key={answer.resolver}
                className="flex flex-wrap items-baseline gap-x-2"
              >
                <span className="font-medium">{answer.resolver}</span>
                <span className="flex flex-col font-mono text-xs break-all">
                  {answer.error
                    ? labels.unreachable
                    : lines.length
                      ? lines.map((line) => <span key={line}>{line}</span>)
                      : labels.noAnswer}
                </span>
              </li>
            );
          })}
        </ul>
        {wildcardNote && <p>{wildcardNote}</p>}
        {negativeCacheNote && <p className="text-xs">{negativeCacheNote}</p>}
      </AlertDescription>
    </Alert>
  );
}
