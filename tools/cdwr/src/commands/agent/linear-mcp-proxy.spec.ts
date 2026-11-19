import { type ChildProcess, spawn } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
  request
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const proxyPath = fileURLToPath(
  new URL(
    '../../../../../apps/agent-host/linear-mcp-proxy.mjs',
    import.meta.url
  )
);

type Recorded = {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
  body: string;
};
type Handler = (req: IncomingMessage, res: ServerResponse) => void;

const rpc = (method: string, params?: unknown, id: number | string = 1) =>
  JSON.stringify({ jsonrpc: '2.0', id, method, params });

const respondJson =
  (status = 200, headers: Record<string, string> = {}): Handler =>
  (_req, res) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }));
  };

describe('linear-mcp-proxy', () => {
  let dir: string;
  let upstream: Server;
  let upstreamPort: number;
  let received: Recorded[];
  let handler: Handler;
  let child: ChildProcess | undefined;
  let base: string;
  let proxyPort: number;
  let headerLog: string;

  const headerCalls = () =>
    readFileSync(headerLog, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

  const startProxy = (env: Record<string, string> = {}) =>
    new Promise<void>((resolve, reject) => {
      child = spawn('node', [proxyPath], {
        env: {
          PATH: process.env['PATH'],
          AGENT_QUEUE_LINEAR_PROXY_PORT: '0',
          AGENT_QUEUE_LINEAR_PROXY_UPSTREAM: `http://127.0.0.1:${upstreamPort}/mcp`,
          AGENT_QUEUE_LINEAR_PROXY_TOOLS: join(dir, 'tools.txt'),
          AGENT_QUEUE_LINEAR_PROXY_HEADER: join(dir, 'header.sh'),
          ...env
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let out = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        out += chunk.toString();
        const match = /listening on 127\.0\.0\.1:(\d+)/.exec(out);
        if (match) {
          proxyPort = Number(match[1]);
          base = `http://127.0.0.1:${proxyPort}/mcp`;
          resolve();
        }
      });
      child.on('error', reject);
      child.on('exit', (code) =>
        reject(new Error(`the proxy exited with ${code} before listening`))
      );
    });

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'linear-mcp-proxy-'));
    headerLog = join(dir, 'header.log');
    writeFileSync(headerLog, '');
    writeFileSync(
      join(dir, 'tools.txt'),
      '# allowed tools\nget_issue\nsave_comment # trailing\n\nlist_issues\n'
    );
    const script = join(dir, 'header.sh');
    writeFileSync(
      script,
      `#!/bin/sh
echo "run $*" >> "${headerLog}"
if [ "$1" = "force" ]; then
  printf '{"Authorization":"Bearer t2"}'
else
  printf '{"Authorization":"Bearer t1"}'
fi
`
    );
    chmodSync(script, 0o755);

    received = [];
    handler = respondJson();
    upstream = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        received.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: Buffer.concat(chunks).toString('utf8')
        });
        handler(req, res);
      });
    });
    await new Promise<void>((resolve) =>
      upstream.listen(0, '127.0.0.1', resolve)
    );
    upstreamPort = (upstream.address() as AddressInfo).port;
  });

  afterEach(async () => {
    const proc = child;
    child = undefined;
    if (proc && proc.exitCode === null) {
      proc.removeAllListeners('exit');
      const exited = new Promise((resolve) => proc.once('exit', resolve));
      proc.kill('SIGKILL');
      await exited;
    }
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });

  const post = (body: string, headers: Record<string, string> = {}) =>
    fetch(base, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers
      },
      body
    });

  it('passes an allowed tools/call signed with the header, not the client one', async () => {
    handler = respondJson(200, { 'mcp-session-id': 'sess-2' });
    await startProxy();
    const body = rpc('tools/call', {
      name: 'get_issue',
      arguments: { id: 'X' }
    });
    const res = await post(body, {
      authorization: 'Bearer evil',
      'mcp-session-id': 'sess-1',
      'mcp-protocol-version': '2025-06-18'
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('mcp-session-id')).toBe('sess-2');
    expect(await res.json()).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { ok: true }
    });
    expect(received).toHaveLength(1);
    expect(received[0].method).toBe('POST');
    expect(received[0].url).toBe('/mcp');
    expect(received[0].body).toBe(body);
    expect(received[0].headers.authorization).toBe('Bearer t1');
    expect(received[0].headers['mcp-session-id']).toBe('sess-1');
    expect(received[0].headers['mcp-protocol-version']).toBe('2025-06-18');
  });

  it('answers a disallowed tools/call with a JSON-RPC error, upstream untouched', async () => {
    await startProxy();
    const res = await post(
      rpc('tools/call', { name: 'delete_comment', arguments: {} }, 'abc')
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      jsonrpc: '2.0',
      id: 'abc',
      error: { code: -32601, message: 'tool not allowed: delete_comment' }
    });
    expect(received).toHaveLength(0);
  });

  it('passes initialize and tools/list through', async () => {
    await startProxy();
    const init = await post(
      rpc('initialize', { protocolVersion: '2025-06-18' })
    );
    const list = await post(rpc('tools/list', {}, 2));

    expect(init.status).toBe(200);
    expect(list.status).toBe(200);
    expect(received.map((r) => JSON.parse(r.body).method)).toEqual([
      'initialize',
      'tools/list'
    ]);
  });

  it('refuses a batch and a non-JSON body with 400', async () => {
    await startProxy();
    const batch = await post(
      JSON.stringify([
        JSON.parse(rpc('tools/call', { name: 'delete_comment' }))
      ])
    );
    const text = await post('not json at all');

    expect(batch.status).toBe(400);
    expect(text.status).toBe(400);
    expect(received).toHaveLength(0);
  });

  it('refuses a foreign Host with 400', async () => {
    await startProxy();
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: proxyPort,
          path: '/mcp',
          method: 'POST',
          headers: {
            host: 'evil.example:80',
            'content-type': 'application/json'
          }
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        }
      );
      req.on('error', reject);
      req.end(rpc('tools/list'));
    });

    expect(status).toBe(400);
    expect(received).toHaveLength(0);
  });

  it('refuses a body over 1 MB', async () => {
    await startProxy();
    const big = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: { pad: 'x'.repeat(1024 * 1024 + 10) }
    });
    const res = await post(big);

    expect(res.status).toBe(400);
    expect(received).toHaveLength(0);
  });

  it('answers 404 for another path and for PUT', async () => {
    await startProxy();
    const other = await fetch(`http://127.0.0.1:${proxyPort}/other`, {
      method: 'POST',
      body: rpc('tools/list')
    });
    const put = await fetch(base, { method: 'PUT', body: rpc('tools/list') });

    expect(other.status).toBe(404);
    expect(put.status).toBe(404);
    expect(received).toHaveLength(0);
  });

  describe('a refused header', () => {
    it('is replaced once with `force` and the request retried', async () => {
      handler = (req, res) =>
        req.headers.authorization === 'Bearer t1'
          ? respondJson(401)(req, res)
          : respondJson(200, { 'x-retried': 'yes' })(req, res);
      await startProxy();

      const res = await post(rpc('tools/list'));

      expect(res.status).toBe(200);
      expect(res.headers.get('x-retried')).toBe('yes');
      expect(received.map((r) => r.headers.authorization)).toEqual([
        'Bearer t1',
        'Bearer t2'
      ]);
      expect(headerCalls()).toEqual(['run', 'run force']);
    });

    it('gives the client the second 401 and tries no third time', async () => {
      handler = respondJson(401);
      await startProxy();

      const res = await post(rpc('tools/list'));

      expect(res.status).toBe(401);
      expect(received).toHaveLength(2);
    });
  });

  it('caches the header across requests', async () => {
    await startProxy();

    await post(rpc('tools/call', { name: 'get_issue' }));
    await post(rpc('tools/call', { name: 'list_issues' }, 2));

    expect(received).toHaveLength(2);
    expect(headerCalls()).toEqual(['run']);
  });

  it('streams an SSE answer event by event', async () => {
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: first\n\n');
      // Waits for the spec to have read the first event; the timer only stops a hang
      const fallback = setTimeout(release, 5000);
      void released.then(() => {
        clearTimeout(fallback);
        res.write('data: second\n\n');
        res.end();
      });
    };
    await startProxy();

    const res = await post(rpc('tools/list'));
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();

    const first = await reader.read();
    const firstText = decoder.decode(first.value);
    expect(firstText).toContain('data: first');
    expect(firstText).not.toContain('second');

    release();
    let rest = '';
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      rest += decoder.decode(chunk.value);
    }
    expect(rest).toContain('data: second');
  });

  describe('the attended route', () => {
    const attendedScript = (body: string): string => {
      const script = join(dir, 'attended.sh');
      writeFileSync(script, `#!/bin/sh\n${body}\n`);
      chmodSync(script, 0o755);
      return script;
    };
    const attended = (method = 'POST', body = '') =>
      fetch(`http://127.0.0.1:${proxyPort}/attended`, {
        method,
        ...(method === 'POST' ? { body } : {})
      });

    it("answers the attended command's JSON, upstream untouched", async () => {
      const script = attendedScript(
        `printf '%s' '{"data":{"issues":{"nodes":[]}}}'`
      );
      await startProxy({ AGENT_QUEUE_LINEAR_ATTENDED: script });
      const res = await attended('POST', 'ignored');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/json');
      expect(await res.json()).toEqual({ data: { issues: { nodes: [] } } });
      expect(received).toEqual([]);
    });

    it('answers 502 when the command fails or prints no JSON', async () => {
      const script = attendedScript('exit 3');
      await startProxy({ AGENT_QUEUE_LINEAR_ATTENDED: script });
      expect((await attended()).status).toBe(502);
      writeFileSync(script, "#!/bin/sh\nprintf 'not json'\n");
      expect((await attended()).status).toBe(502);
    });

    it('answers 404 for GET /attended', async () => {
      await startProxy({
        AGENT_QUEUE_LINEAR_ATTENDED: attendedScript('exit 0')
      });
      expect((await attended('GET')).status).toBe(404);
    });
  });

  it('exits non-zero when the tools file is missing', async () => {
    await expect(
      startProxy({
        AGENT_QUEUE_LINEAR_PROXY_TOOLS: join(dir, 'missing.txt')
      })
    ).rejects.toThrow(/exited with 1/);
  });
});
