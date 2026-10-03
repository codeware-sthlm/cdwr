/**
 * Integration test: the real build behind the real HTTP server.
 *
 * Needs the workspace toolchain (esbuild, typescript, the theme and the UI
 * kit), so it runs only in a checkout. The first build is cold.
 */
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import { runComponentBuild } from '@codeware/app-cms/feature/component-builder';
import type { ComponentBuildResult } from '@codeware/shared/util/payload-utils';
import { serve } from '@hono/node-server';

import { createApp } from './app';

const noop = () => undefined;

jest.setTimeout(60_000);

const TOKEN = 'test-token';
const root = path.resolve(__dirname, '../../..');

const counter = `import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@site/ui';

type Props = { label?: string; step?: number };

export default function Counter({ label = 'Clicks', step = 1 }: Props) {
  const [count, setCount] = useState(0);
  return (
    <Card className="max-w-sm">
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent className="flex items-center gap-4">
        <span className="text-3xl font-semibold tabular-nums">{count}</span>
        <Button onClick={() => setCount((n) => n + step)}>+{step}</Button>
      </CardContent>
    </Card>
  );
}
`;

const propsSchema = [
  { name: 'label', type: 'text' },
  { name: 'step', type: 'number' }
];

describe('builder service (integration)', () => {
  let server: ReturnType<typeof serve>;
  let url: string;

  beforeAll(async () => {
    const app = createApp({
      tokens: [TOKEN],
      logger: { info: noop, warn: noop, error: noop },
      build: (input) =>
        runComponentBuild(input, { root, cwd: path.join(root, 'apps/builder') })
    });
    server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
    await new Promise<void>((resolve) => server.once('listening', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const build = (
    body: Record<string, unknown>,
    headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }
  ) =>
    fetch(`${url}/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });

  const buildOk = async (body: Record<string, unknown>) => {
    const response = await build(body);
    expect(response.status).toBe(200);
    return (await response.json()) as ComponentBuildResult;
  };

  it('answers the health check', async () => {
    const response = await fetch(`${url}/api/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('builds the sample component into a bundle that shares the host React', async () => {
    const result = await buildOk({
      source: counter,
      tagName: 'cdwr-x-counter',
      propsSchema
    });

    if (!result.ok) {
      throw new Error(JSON.stringify(result.diagnostics));
    }
    expect(result.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(result.js).toContain('customElements.define("cdwr-x-counter"');
    expect(result.js).toContain('__cdwrHost');
    expect(result.js).not.toContain('useReducer');
    // Only the component's own classes are generated; the kit styles itself
    expect(result.css).toContain('.text-3xl');
    expect(result.css).toContain('--text-3xl');
    expect(result.props).toEqual(
      expect.arrayContaining([
        { name: 'label', kind: 'string', optional: true },
        { name: 'step', kind: 'number', optional: true }
      ])
    );
    expect(result.diagnostics).toEqual([]);
  });

  it('reports a type error with its line', async () => {
    const result = await buildOk({
      source: `${counter}\nconst x: number = 'nope';\n`,
      tagName: 'cdwr-x-counter',
      propsSchema
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        line: expect.any(Number)
      })
    ]);
    expect(result.diagnostics[0].line).toBeGreaterThan(1);
  });

  it('reports a declared input whose type does not match the code', async () => {
    const result = await buildOk({
      source: counter,
      tagName: 'cdwr-x-counter',
      propsSchema: [
        { name: 'label', type: 'number' },
        { name: 'step', type: 'number' }
      ]
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('label')
      })
    ]);
  });

  it('refuses a build without a token', async () => {
    const response = await build(
      { source: counter, tagName: 'cdwr-x-counter' },
      {}
    );

    expect(response.status).toBe(401);
  });

  it('refuses a build with the wrong token', async () => {
    const response = await build(
      { source: counter, tagName: 'cdwr-x-counter' },
      { authorization: 'Bearer nope' }
    );

    expect(response.status).toBe(401);
  });
});
