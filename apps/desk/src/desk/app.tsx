import { useEffect, useReducer } from 'react';

import {
  clickSettings,
  closeSettings,
  focusOpener,
  frame,
  hasAdapter,
  hideSheet,
  modelAt,
  pauseQueue,
  platformActions,
  problemActions,
  refresh,
  runNow,
  setSnoozedOpen,
  settingsClosed,
  sheetActions,
  showSheet,
  showView,
  store
} from './actions';
import { Capacity } from './components/capacity';
import { Cards } from './components/cards';
import { Platform } from './components/platform';
import {
  Alert,
  FrozenLabel,
  Problems,
  frozenLabel
} from './components/problems';
import {
  SETTINGS_SUB,
  SETTINGS_TITLE,
  SettingsForm
} from './components/settings';
import { Sheet } from './components/sheet';
import { SHEETS } from './components/sheets';
import { Status } from './components/status';
import { Tiles } from './components/tiles';
import { AGENT_AVATAR } from './constants';
import type { Model } from './model';
import { notice } from './notice';
import { type DeskState, bucketsLoaded } from './state';
import { useStore } from './store';
import { forgetLabelled } from './view/waiting';

// The timers and the connection's grace move without an event. A healthy page checks every 15th tick: a host can go silent without one.
const QUIET_TICKS = 15;

/** Redraws every second while the page is visible; only every 15th second when `quiet` */
const useTick = (quiet: boolean): void => {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    let ticks = 0;
    const id = setInterval(() => {
      if (document.hidden) return;
      ticks += 1;
      if (quiet && ticks % QUIET_TICKS !== 0) return;
      tick();
    }, 1000);
    return () => clearInterval(id);
  }, [quiet]);
};

const fresh = (state: DeskState): string =>
  frame.refreshing
    ? 'Refreshing…'
    : bucketsLoaded(state.data)
      ? 'Updated ' +
        new Date(state.data.storedAt || Date.now()).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })
      : hasAdapter()
        ? 'Loading…'
        : 'Waiting for settings';

/** The frame every sheet and the settings form open in */
const SheetFrame = ({ m, state, now }: Props) => {
  if (frame.settingsShown)
    return (
      <Sheet
        open={frame.settings !== null}
        title={SETTINGS_TITLE}
        sub={SETTINGS_SUB}
        // The form focuses its first field
        focus={false}
        onClose={closeSettings}
        onClosed={settingsClosed}
      >
        {frame.settings ? (
          <SettingsForm
            key={frame.settingsForm}
            {...frame.settings}
            onDone={closeSettings}
          />
        ) : null}
      </Sheet>
    );
  const def = SHEETS[frame.shownSheet];
  return (
    <Sheet
      open={state.ui.openSheet !== null}
      title={def.title}
      sub={def.sub}
      focus={frame.sheetFocus}
      onClose={hideSheet}
      onClosed={focusOpener}
    >
      <def.Body m={m} state={state} now={now} actions={sheetActions} />
    </Sheet>
  );
};

type Props = { m: Model; state: DeskState; now: Date };

/** The page: the header, the desk or the Platform view, and the sheet frame */
export const App = () => {
  const state = useStore(store);
  const now = new Date();
  const m = modelAt(now);
  forgetLabelled(state.controls.labelled, m.v ? m.toLabel : null);
  const problems = m.problems.length > 0;
  useTick(state.data.connection.live && !problems);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // An open sheet closes on its own Escape, which marks the event handled
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (store.state.ui.view === 'platform') showView('desk');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const platform = state.ui.view === 'platform';
  const label = frozenLabel(m);
  const note = notice(state.errors, hasAdapter());
  return (
    <>
      {problems ? (
        <div id="alert">
          <Alert m={m} onSeeProblems={problemActions.seeProblems} />
        </div>
      ) : null}
      <div className="wrap">
        <header className="top">
          <div className="brand">
            <h1>Agent Desk</h1>
            <span className="sub">
              cdwr · what the work queue does next, and what waits on you
            </span>
          </div>
          <div className="tools">
            <a
              className="who"
              href="https://github.com/apps/codeware-agent"
              target="_blank"
              rel="noreferrer"
              title="Commits, pull requests and review replies are made as this GitHub App"
            >
              <img className="av" src={AGENT_AVATAR} alt="" />
              on GitHub as codeware-agent[bot]
            </a>
            <span id="status" className="status" aria-live="polite">
              <Status
                m={m}
                connection={state.data.connection}
                onView={(view) => showView(view)}
              />
            </span>
            <span id="fresh">{fresh(state)}</span>
            <button
              id="refresh"
              type="button"
              className="tool"
              onClick={refresh}
            >
              Refresh
            </button>
            <button
              id="settings"
              type="button"
              className="tool"
              aria-label="Settings"
              onClick={clickSettings}
            >
              Settings
            </button>
          </div>
        </header>

        {note.hidden ? null : (
          <div id="notice" className={note.severe ? 'notice err' : 'notice'}>
            {note.text}
          </div>
        )}

        {platform ? (
          <main
            id="platform"
            className="platform-view"
            aria-labelledby="platform-title"
          >
            <Platform m={m} now={now} actions={platformActions} />
          </main>
        ) : (
          <>
            <section
              className="cards"
              id="cards"
              aria-label="Session and what waits on you"
            >
              <Cards
                m={m}
                details={state.details}
                now={now}
                snoozedOpen={state.ui.snoozedOpen}
                onSnoozedOpen={setSnoozedOpen}
                onSheet={(id) => showSheet(id)}
              />
            </section>
            {problems ? (
              <section className="problems" id="problems" aria-label="Problems">
                <Problems m={m} now={now} actions={problemActions} />
              </section>
            ) : null}
            {label ? (
              <h2 className="frozen-label" id="frozen-label">
                <FrozenLabel m={m} />
              </h2>
            ) : null}
            <section
              className={label ? 'capacity frozen' : 'capacity'}
              id="capacity"
              aria-label="Capacity: limits and hosts"
            >
              <Capacity
                m={m}
                onSheet={(id) => showSheet(id)}
                onView={(view) => showView(view)}
                pause={pauseQueue}
                run={runNow}
              />
            </section>
            <nav
              className={label ? 'more frozen' : 'more'}
              id="more"
              aria-label="More detail"
            >
              <Tiles
                m={m}
                state={state}
                now={now}
                onSheet={(id) => showSheet(id)}
              />
            </nav>
          </>
        )}
      </div>
      <SheetFrame m={m} state={state} now={now} />
    </>
  );
};
