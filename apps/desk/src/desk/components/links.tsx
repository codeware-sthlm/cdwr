import type { ReactNode } from 'react';

import { GH_PR, LINEAR_ISSUE } from '../constants';
import { tidy } from '../format';
import type { Model } from '../model';
import type { Detail } from '../state';
import type { PrRef } from '../types';
import { isTicketId } from '../view/ids';
import { type PrTone, prPillData } from '../view/pr';

import { ID, ID_LINK, PILL, PILL_TONE, PRN, PRN_TONE } from './items-ui';

// The desk's links, pills and chips: ticket ids, pull requests and Linear text

/** A ticket id as a link to Linear; anything else as a plain id, a dash when empty */
export const IdLink = ({ id = '' }: { id?: string }) =>
  isTicketId(id) ? (
    <a
      className={ID_LINK}
      href={LINEAR_ISSUE + id}
      target="_blank"
      rel="noopener noreferrer"
    >
      {id}
    </a>
  ) : (
    <span className={ID}>{id || '—'}</span>
  );

/** The pull request's number as a link, tinted by its live tone; nothing without one */
export const Prn = ({
  n,
  tone
}: {
  n: PrRef | null | undefined;
  tone?: PrTone;
}) =>
  n ? (
    <a
      className={`${PRN} ${PRN_TONE[tone ?? 'neutral']}${tone && tone !== 'neutral' ? ' ' + tone : ''}`}
      href={GH_PR + n}
      target="_blank"
      rel="noopener noreferrer"
      title={`Pull request ${n}`}
    >
      #{n}
    </a>
  ) : null;

/** The pull request as a plain id link; nothing without one */
export const PrLink = ({ n }: { n: PrRef | null | undefined }) =>
  n ? (
    <a
      className={ID_LINK}
      href={GH_PR + n}
      target="_blank"
      rel="noopener noreferrer"
    >
      #{n}
    </a>
  ) : null;

// The team's ids only: free text also holds UTF-8 and SHA-256
const TEXT_ID = /(\bCOD-\d+\b)/;
const CODE_SPAN = /`([^`]+)`/;

/** Plain text with every ticket id in it linked */
export const LinkIds = ({ text }: { text: string }) => (
  <>
    {text.split(TEXT_ID).map((part, i) =>
      // split with a capture group puts the ids at the odd indexes
      i % 2 ? <IdLink key={i} id={part} /> : part
    )}
  </>
);

/** Text from Linear with its links named,links named, `code` spans in <code>, ticket ids linked */
export const Inline = ({ text }: { text: string | null | undefined }) => (
  <>
    {tidy(text)
      .split(CODE_SPAN)
      .map((part, i) =>
        // split with a capture group puts the code spans at the odd indexes
        i % 2 ? (
          <code key={i}>
            <LinkIds text={part} />
          </code>
        ) : (
          <LinkIds key={i} text={part} />
        )
      )}
  </>
);

/** The PR's state pill and, when a github event landed, how long ago; `children` sit between the two */
export const PrPill = ({
  m,
  details,
  x,
  now,
  children
}: {
  m: Pick<Model, 'agentPrs'>;
  details: ReadonlyMap<string, Detail>;
  x: { ticket: string; pr?: PrRef | null };
  now: Date;
  children?: ReactNode;
}) => {
  const { tone, text, age } = prPillData(m, details, x, now);
  return (
    <>
      <span className={`${PILL} ${tone} ${PILL_TONE[tone]}`}>{text}</span>
      {children}
      {age === null ? null : <time>{age}</time>}
    </>
  );
};
