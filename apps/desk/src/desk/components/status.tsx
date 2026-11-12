import { hhmm, hhmmss, plural } from '../format';
import { ofKind } from '../live';
import type { Model } from '../model';
import type { Connection } from '../state';
import { platform } from '../view/header';

// The header's live part: the Platform pill and the LIVE dot. The title, bot line, Refresh and Settings are drawn by App.

const Sliders = () => (
  <svg
    aria-hidden="true"
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

type Props = {
  m: Model;
  connection: Connection;
  onView: (view: 'platform') => void;
};

export const Status = ({ m, connection, onView }: Props) => {
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
      className="platform"
      onClick={() => onView('platform')}
      title={title || undefined}
      aria-label={label}
    >
      <Sliders />
      <span className="name">Platform</span>
      {loading ? (
        <span className="checks">checks –</span>
      ) : p.failing.length ? (
        <span className="checks bad">{p.failing.length} failing</span>
      ) : (
        <span className="checks ok">checks ok</span>
      )}
      {p.updates ? (
        <span className="updates">
          · {plural(p.updates, 'update', 'updates')}
        </span>
      ) : null}
      {flag ? <i className={`flag ${flag}`} aria-hidden="true"></i> : null}
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
          className="conn offline"
          title="Live updates are down. The desk polls instead, so numbers may lag."
        >
          <i className="dot" aria-hidden="true"></i>
          <b>OFFLINE</b>
          <span className="at">
            <span className="long">{longText}</span>
            <span className="short">since {hhmm(last)}</span>
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
          className="conn on"
          title="Linear and the queue push changes as they happen. Focus and Refresh still reload everything."
        >
          <i className="dot" aria-hidden="true"></i>
          <b>LIVE</b>
          {at ? (
            <span className="at">
              <span className="long">realtime · {hhmmss(at)}</span>
              <span className="short">{hhmm(at)}</span>
            </span>
          ) : null}
        </span>
      ) : (
        <span
          className="conn off"
          title="Live updates are not connected. The desk reloads every 5 minutes, on focus and on Refresh."
        >
          <i className="dot" aria-hidden="true"></i>
          <b>POLLING</b>
          <span className="at">every 5 min</span>
        </span>
      )}
    </>
  );
};
