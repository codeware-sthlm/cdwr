import { plural } from '../format';
import type { Model } from '../model';

// What the header's Platform pill counts; the pill itself is components/status.tsx.

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
