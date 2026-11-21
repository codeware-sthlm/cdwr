import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

import { z } from 'zod';

import { type Plan, defineCommand } from '../../cli/command';
import { input } from '../../cli/inputs';
import { paths, readText, requireHost } from '../../services/agent-queue';

import {
  NOTIFY_LEVELS,
  type NotifyLevel,
  type QueuePaths,
  parseNotifyLevel,
  parseNotifyMuteUntil
} from './agent.logic';
import {
  type RemoteTarget,
  hostInput,
  remoteApply,
  remotePlan
} from './remote';

const MUTE_OFF = 'off';

/** `off`, or a time Date can read */
const muteSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === MUTE_OFF || !Number.isNaN(Date.parse(value)),
    "not an ISO time (2026-11-22T08:00:00+01:00) or 'off'"
  );

/** The two settings as one line */
const describe = (level: NotifyLevel, muteUntil: string | undefined): string =>
  `Notify level: ${level} · ${muteUntil ? `muted until ${muteUntil}` : 'not muted'}`;

interface Local {
  queue: QueuePaths;
  level: NotifyLevel;
  muteUntil: string | undefined;
  /** What the run changes; undefined leaves it */
  setLevel?: NotifyLevel;
  setMute?: string | typeof MUTE_OFF;
}

type Data =
  Local | { remote: RemoteTarget; level?: NotifyLevel; muteUntil?: string };

export default defineCommand({
  summary:
    'Which notices reach Slack: urgent, action or all, and a mute for the quiet hours',
  description:
    '`urgent` sends only what Håkan must attend to, `action` also what waits on him (gates, a PR ready, failed runs), `all` progress too. Until the time given to `--mute-until` only urgent goes through; `--mute-until off` ends a mute. The NUC relay forwards what the dial lets through. Without arguments, prints both settings.',
  danger: 'mutate',
  confirm: 'never',
  inputs: {
    level: input.optional(
      input.enum(NOTIFY_LEVELS, {
        prompt: 'Which level?',
        description: 'urgent, action or all',
        positional: true,
        flagOnly: true
      }),
      () => true
    ),
    muteUntil: input.optional(
      input.string({
        prompt: 'Mute until when?',
        short: 'm',
        description:
          'An ISO time until which only urgent notices go to Slack, or `off` to end a mute',
        schema: muteSchema,
        flagOnly: true
      }),
      () => true
    ),
    host: hostInput(
      'Read or set the dial of the queue in the agent container over ssh on this host instead of locally'
    )
  },

  async plan(ctx, { level, muteUntil, host }): Promise<Plan<Data>> {
    // Both are normalized the way they are written, so the remote and this side agree
    const mute =
      muteUntil === undefined || muteUntil === MUTE_OFF
        ? muteUntil
        : new Date(muteUntil).toISOString();
    if (host) {
      // Without either the remote answers its current dial as nothing
      const remote = {
        host,
        args: [
          'agent',
          'notify',
          ...(level ? [level] : []),
          ...(mute === undefined ? [] : ['--mute-until', mute])
        ]
      };
      const plan = await remotePlan(ctx, remote);
      return { ...plan, data: { remote, level, muteUntil: mute } };
    }
    requireHost(['launchd', 'container'], ctx.env);
    const queue = paths(ctx.env);
    const current = parseNotifyLevel(readText(queue.notifyLevel));
    const currentMute = parseNotifyMuteUntil(
      readText(queue.notifyMuteUntil),
      new Date()
    );
    const base = { queue, level: current, muteUntil: currentMute };
    if (level === undefined && mute === undefined) {
      return { steps: [], nothing: describe(current, currentMute), data: base };
    }

    const setLevel =
      level !== undefined && level !== current ? level : undefined;
    // A mute file holding a past time counts as no mute, but off still clears it
    const setMute =
      mute === undefined
        ? undefined
        : mute === MUTE_OFF
          ? existsSync(queue.notifyMuteUntil)
            ? MUTE_OFF
            : undefined
          : mute === currentMute
            ? undefined
            : mute;
    if (setLevel === undefined && setMute === undefined) {
      return {
        steps: [],
        nothing: `Already ${describe(current, currentMute)}`,
        data: base
      };
    }
    return {
      steps: [
        ...(setLevel
          ? [
              {
                label: `Set the notify level to ${setLevel}`,
                detail: queue.notifyLevel
              }
            ]
          : []),
        ...(setMute === MUTE_OFF
          ? [{ label: 'End the mute', detail: queue.notifyMuteUntil }]
          : setMute
            ? [
                {
                  label: `Mute all but urgent until ${setMute}`,
                  detail: queue.notifyMuteUntil
                }
              ]
            : [])
      ],
      data: { ...base, setLevel, setMute }
    };
  },

  async apply(ctx, data) {
    if ('remote' in data) {
      return remoteApply(
        ctx,
        data.remote,
        `Notify level: ${data.level ?? 'unchanged'}`
      );
    }
    const { queue, setLevel, setMute } = data;
    mkdirSync(queue.home, { recursive: true });
    if (setLevel) writeFileSync(queue.notifyLevel, `${setLevel}\n`);
    let muteUntil = data.muteUntil;
    if (setMute === MUTE_OFF) {
      rmSync(queue.notifyMuteUntil, { force: true });
      muteUntil = undefined;
    } else if (setMute) {
      writeFileSync(queue.notifyMuteUntil, `${setMute}\n`);
      muteUntil = setMute;
    }
    const level = setLevel ?? data.level;
    return {
      summary: describe(level, muteUntil),
      json: { level, muteUntil: muteUntil ?? null }
    };
  }
});
