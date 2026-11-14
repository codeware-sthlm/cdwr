import { hhmm, hhmmss, plural } from '../format';
import { ofKind } from '../live';
import { type Model, treeGapped, treeRoots } from '../model';
import type { Connection, View } from '../state';
import { platform } from '../view/header';

import { Icon } from './icon';

// The header's live part: the Platform and Tree pills and the LIVE dot. The title, bot line, Refresh and Settings are drawn by App.

const Sliders = () => (
  <svg
    aria-hidden="true"
    className="flex-none text-[color:var(--muted)]"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </svg>
);

// The LIVE dot and its label: the tone (on, off, offline) picks the colours; the phone keeps the short time
const CONN =
  'inline-flex items-center gap-[7px] font-[family-name:var(--font-mono)] text-[11px] leading-[normal] font-normal';
const DOT = 'size-2 flex-none rounded-[var(--r-pill)]';
const B = 'font-normal tracking-[0.1em]';
const LONG = 'long max-[600px]:hidden';
const SHORT = 'short hidden max-[600px]:inline';

const PILL =
  'relative inline-flex min-h-[var(--tap)] items-center gap-2 rounded-[var(--r-pill)] bg-[color:var(--surface)] px-4 py-0 font-[family-name:var(--font-ui)] text-[12px] leading-[normal] font-normal max-[600px]:w-[var(--tap)] max-[600px]:justify-center max-[600px]:border-0 max-[600px]:bg-transparent max-[600px]:p-0';

type TreePillProps = {
  m: Model;
  /** The view on show, for `aria-current` */
  view: View;
  onView: (view: 'tree') => void;
};

/** The header's Tree button: the root count, and the gaps in the wait tone */
export const TreePill = ({ m, view, onView }: TreePillProps) => {
  const loading = !m.runs;
  const roots = treeRoots(m.tree);
  const gaps = treeGapped(m.tree);
  const label = `Ticket tree: ${loading ? 'loading' : plural(roots, 'root', 'roots') + (gaps ? ', ' + plural(gaps, 'gap', 'gaps') : '')}`;
  return (
    <button
      type="button"
      className={`tree-pill ${PILL}`}
      data-view="tree"
      onClick={() => onView('tree')}
      aria-label={label}
      aria-current={view === 'tree' ? 'page' : undefined}
    >
      <Icon
        name="ticket"
        className="size-4 flex-none stroke-[color:var(--muted)]"
      />
      <span className="name max-[600px]:hidden">Tree</span>
      <span className="roots max-[600px]:hidden">{loading ? '–' : roots}</span>
      {!loading && gaps ? (
        <span className="gaps text-[color:var(--wait)] max-[600px]:hidden">
          · {plural(gaps, 'gap', 'gaps')}
        </span>
      ) : null}
      {!loading && gaps ? (
        <i
          className="flag wait absolute top-[9px] right-[9px] hidden size-[7px] rounded-[var(--r-pill)] bg-[color:var(--wait)] max-[600px]:block"
          aria-hidden="true"
        ></i>
      ) : null}
    </button>
  );
};

type Props = {
  m: Model;
  connection: Connection;
  /** The view on show, for the Platform pill's `aria-current` */
  view?: View;
  onView: (view: 'platform') => void;
};

export const Status = ({ m, connection, view = 'desk', onView }: Props) => {
  const p = platform(m);
  const loading = !m.runs;
  const flag = p.failing.length ? 'bad' : p.updates ? 'wait' : '';
  const title = [
    p.failing.length ? 'Failing: ' + p.failing.join(', ') : '',
    p.updates ? plural(p.updates, 'update', 'updates') + ' behind main' : ''
  ]
    .filter(Boolean)
    .join('. ');
  const label = `Platform: ${loading ? 'loading' : p.failing.length ? p.failing.length + ' failing' : 'checks ok'}${p.updates ? ', ' + plural(p.updates, 'update', 'updates') : ''}`;
  const pill = (
    <button
      type="button"
      className={`platform ${PILL}`}
      data-view="platform"
      onClick={() => onView('platform')}
      title={title || undefined}
      aria-label={label}
      aria-current={view === 'platform' ? 'page' : undefined}
    >
      <Sliders />
      <span className="name max-[600px]:hidden">Platform</span>
      {loading ? (
        <span className="checks max-[600px]:hidden">checks –</span>
      ) : p.failing.length ? (
        <span className="checks bad text-[color:var(--block)] max-[600px]:hidden">
          {p.failing.length} failing
        </span>
      ) : (
        <span className="checks ok text-[color:var(--live)] max-[600px]:hidden">
          checks ok
        </span>
      )}
      {p.updates ? (
        <span className="updates text-[color:var(--wait)] max-[600px]:hidden">
          · {plural(p.updates, 'update', 'updates')}
        </span>
      ) : null}
      {flag ? (
        <i
          className={`flag ${flag} absolute top-[9px] right-[9px] hidden size-[7px] rounded-[var(--r-pill)] max-[600px]:block ${flag === 'bad' ? 'bg-[color:var(--block)]' : 'bg-[color:var(--wait)]'}`}
          aria-hidden="true"
        ></i>
      ) : null}
    </button>
  );
  const at = m.pulse?.at ?? connection.upSince;
  const down = ofKind(m.problems, 'connection')[0];
  if (down) {
    const last = m.pulse?.at ?? down.since;
    const longText = m.pulse
      ? `last event ${hhmmss(last)}`
      : `down since ${hhmmss(last)}`;
    return (
      <>
        {pill}
        <span
          className={`conn offline ${CONN}`}
          title="Live updates are down. The desk polls instead, so numbers may lag."
        >
          <i
            className={`dot ${DOT} bg-[color:var(--block)] motion-safe:animate-[blink_1s_ease-in-out_infinite]`}
            aria-hidden="true"
          ></i>
          <b className={`${B} text-[color:var(--block)]`}>OFFLINE</b>
          <span className="at text-[color:var(--muted)]">
            <span className={LONG}>{longText}</span>
            <span className={SHORT}>since {hhmm(last)}</span>
          </span>
        </span>
      </>
    );
  }
  return (
    <>
      {pill}
      {connection.live ? (
        <span
          className={`conn on ${CONN}`}
          title="Linear and the queue push changes as they happen. Focus and Refresh still reload everything."
        >
          <i
            className={`dot ${DOT} bg-[color:var(--live)] motion-safe:animate-[beat_2s_ease-in-out_infinite]`}
            aria-hidden="true"
          ></i>
          <b className={`${B} text-[color:var(--live)]`}>LIVE</b>
          {at ? (
            <span className="at">
              <span className={LONG}>realtime · {hhmmss(at)}</span>
              <span className={SHORT}>{hhmm(at)}</span>
            </span>
          ) : null}
        </span>
      ) : (
        <span
          className={`conn off ${CONN}`}
          title="Live updates are not connected. The desk reloads every 5 minutes, on focus and on Refresh."
        >
          {/* Not connected: the unknown state, dashed and striped */}
          <i
            className={`dot ${DOT} bg-transparent bg-[image:var(--unknown)] outline-1 outline-offset-1 outline-[color:var(--faint)] outline-dashed`}
            aria-hidden="true"
          ></i>
          <b className={B}>POLLING</b>
          <span className="at">every 5 min</span>
        </span>
      )}
    </>
  );
};
