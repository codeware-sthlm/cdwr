import { esc, hhmm, hhmmss, plural } from '../format';
import type { Model } from '../model';
import type { Connection } from '../state';

import { ofKind } from './problems';

// The header's live part: the Platform pill and the LIVE dot. The title, bot line, Refresh and Settings are static in index.html.

const SLIDERS =
  '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>';

export type Platform = {
  /** The names of the checks that fail; a run problem counts as one */
  failing: string[];
  /** What runs behind main: the image, the desk, the install */
  updates: number;
};

/** What the Platform pill counts, from the health checks and what is behind main */
export const platform = (m: Model): Platform => ({
  failing: [
    ...m.health.filter((c) => !c.ok).map((c) => c.name),
    ...(m.runs && m.schedulerStale
      ? [`scheduler silent ${Math.floor(m.lastRunAge ?? 0)} h`]
      : []),
    ...(m.runProblems.length
      ? [plural(m.runProblems.length, 'run problem', 'run problems')]
      : [])
  ],
  updates:
    Number(m.imageBehind !== null) +
    Number(m.deskBehind !== null) +
    Number(m.installStale)
});

export const renderStatus = (m: Model, connection: Connection): string => {
  const p = platform(m);
  const loading = !m.runs;
  const checks = loading
    ? '<span class="checks">checks –</span>'
    : p.failing.length
      ? `<span class="checks bad">${p.failing.length} failing</span>`
      : '<span class="checks ok">checks ok</span>';
  const updates = p.updates
    ? `<span class="updates">· ${plural(p.updates, 'update', 'updates')}</span>`
    : '';
  const flag = p.failing.length ? 'bad' : p.updates ? 'wait' : '';
  const title = [
    p.failing.length ? 'Failing: ' + p.failing.join(', ') : '',
    p.updates ? plural(p.updates, 'update', 'updates') + ' behind main' : ''
  ]
    .filter(Boolean)
    .join('. ');
  const pill = `<button type="button" class="platform" data-view="platform"${title ? ` title="${esc(title)}"` : ''} aria-label="Platform: ${esc(loading ? 'loading' : p.failing.length ? p.failing.length + ' failing' : 'checks ok')}${p.updates ? ', ' + esc(plural(p.updates, 'update', 'updates')) : ''}">${SLIDERS}<span class="name">Platform</span>${checks}${updates}${flag ? `<i class="flag ${flag}" aria-hidden="true"></i>` : ''}</button>`;
  const at = m.pulse?.at ?? connection.upSince;
  const down = ofKind(m.problems, 'connection')[0];
  if (down) {
    const last = m.pulse?.at ?? down.since;
    const longText = m.pulse
      ? `last event ${hhmmss(last)}`
      : `down since ${hhmmss(last)}`;
    return (
      pill +
      `<span class="conn offline" title="Live updates dropped. The numbers on the desk are from the last event."><i class="dot" aria-hidden="true"></i><b>OFFLINE</b><span class="at"><span class="long">${esc(longText)}</span><span class="short">since ${esc(hhmm(last))}</span></span></span>`
    );
  }
  const live = connection.live
    ? `<span class="conn on" title="Linear and the queue push changes as they happen. Focus and Refresh still reload everything."><i class="dot" aria-hidden="true"></i><b>LIVE</b>${at ? `<span class="at"><span class="long">realtime · ${esc(hhmmss(at))}</span><span class="short">${esc(hhmm(at))}</span></span>` : ''}</span>`
    : `<span class="conn off" title="Live updates are not connected. The desk reloads every 5 minutes, on focus and on Refresh."><i class="dot" aria-hidden="true"></i><b>POLLING</b><span class="at">every 5 min</span></span>`;
  return pill + live;
};
