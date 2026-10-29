import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { defineCommand } from '../../cli/command';
import { CliError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { paths, requireHost } from '../../services/agent-queue';

import {
  BEAT_MS,
  type ChannelStatus,
  type ListenerState,
  createListener
} from './listen.logic';

const URL_ENV = 'AGENT_SUPABASE_URL';
const KEY_ENV = 'AGENT_SUPABASE_ANON_KEY';
const TABLES = ['issue_events', 'github_events'] as const;

export default defineCommand({
  summary: 'Wake the scheduler when issue or GitHub events arrive',
  description: `Subscribes to Supabase Realtime changes on issue_events and github_events and sends SIGUSR1 to the given pid, debounced and at most once a minute. It only wakes the scheduler; it decides nothing. Needs ${URL_ENV} and ${KEY_ENV} (the publishable key, never the service key). Writes listener.json in the queue home and exits 1 when it cannot recover, so a supervisor restarts it.`,
  danger: 'read',
  history: false,
  inputs: {
    notifyPid: input.number({
      prompt: 'Which pid should be woken?',
      flag: 'notify-pid',
      short: 'P',
      description: 'The process that receives SIGUSR1 on a wake',
      schema: z.number().int().positive()
    })
  },

  async plan(ctx, { notifyPid }) {
    requireHost(['container'], ctx.env);
    const url = ctx.env[URL_ENV];
    const key = ctx.env[KEY_ENV];
    if (!url) throw new CliError(`${URL_ENV} is not set`);
    if (!key) throw new CliError(`${KEY_ENV} is not set`);
    return {
      steps: [`Listen on issue_events and github_events, wake ${notifyPid}`],
      data: { url, key, stateFile: join(paths(ctx.env).home, 'listener.json') }
    };
  },

  async apply(_ctx, { url, key, stateFile }, { notifyPid }) {
    mkdirSync(join(stateFile, '..'), { recursive: true });
    const persist = (state: ListenerState): void => {
      const tmp = `${stateFile}.tmp`;
      writeFileSync(tmp, JSON.stringify(state));
      renameSync(tmp, stateFile);
    };

    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    let channel = client.channel('agent-listener');

    return new Promise((resolve) => {
      const finish = (code: number): void => {
        clearInterval(beat);
        void client.removeChannel(channel).finally(() => process.exit(code));
      };
      const listener = createListener({
        pid: process.pid,
        now: () => new Date(),
        wake: () => {
          try {
            process.kill(notifyPid, 'SIGUSR1');
            return true;
          } catch {
            // Gone, or no longer ours (EPERM): either way nothing is left to wake
            return false;
          }
        },
        persist,
        log: (line) => console.log(`${new Date().toISOString()} ${line}`),
        fail: () => finish(1)
      });

      for (const table of TABLES) {
        for (const event of ['INSERT', 'UPDATE'] as const) {
          channel = channel.on(
            'postgres_changes',
            { event, schema: 'public', table },
            () => listener.event()
          );
        }
      }
      const beat = setInterval(listener.beat, BEAT_MS);
      persist(listener.state());
      channel.subscribe((status: string) => {
        if (
          status === 'SUBSCRIBED' ||
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          listener.status(status as ChannelStatus);
        }
      });

      const shutdown = (): void => {
        listener.stop();
        finish(0);
      };
      process.once('SIGTERM', shutdown);
      process.once('SIGINT', shutdown);
      void resolve;
    });
  }
});
