import { spawnSync } from 'node:child_process';

import { beforeAll } from 'vitest';

export type Tool = 'zsh' | 'jq';

const PROBE: Record<Tool, string[]> = {
  zsh: ['-c', 'true'],
  jq: ['--version']
};

// Probed once per worker, however many suites ask
const found = new Map<Tool, boolean>();

const has = (tool: Tool) => {
  if (!found.has(tool)) {
    const res = spawnSync(tool, PROBE[tool]);
    found.set(tool, !res.error && res.status === 0);
  }
  return found.get(tool);
};

/** The error a spec fails with when `tool` is not installed */
const toolMissing = (tool: Tool) =>
  new Error(`${tool} not found: install ${tool} to run this spec`);

/**
 * Fails the surrounding suite when a tool the scripts need is missing,
 * instead of skipping it: a quiet skip reports green for scripts that never ran.
 */
export function requireTools(...tools: Tool[]) {
  beforeAll(() => {
    for (const tool of tools) {
      if (!has(tool)) throw toolMissing(tool);
    }
  });
}
