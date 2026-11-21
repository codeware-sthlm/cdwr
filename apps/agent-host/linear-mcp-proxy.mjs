#!/usr/bin/env node
// The claude runs' Linear MCP in the container (COD-658): listens on 127.0.0.1 only, signs each
// request with the header `lib.sh header` prints, and passes it to Linear's MCP. A tools/call for
// a tool not in linear-tools.txt is answered here with a JSON-RPC error and never reaches Linear.
// The session never sees the token: it lives in this process and in lib.sh's cache.
// Plain Node, no dependency: the image runs no build. Env, for the image and the specs:
//   AGENT_QUEUE_LINEAR_PROXY_PORT      the port (0 picks one; the listening line names it)
//   AGENT_QUEUE_LINEAR_PROXY_UPSTREAM  Linear's MCP url
//   AGENT_QUEUE_LINEAR_PROXY_TOOLS     the allowlist, else linear-tools.txt in the queue home
//   AGENT_QUEUE_LINEAR_PROXY_HEADER    the header command, else `zsh <queue home>/lib.sh header`;
//                                      run with `force` after Linear refused the header
//   AGENT_QUEUE_LINEAR_ATTENDED        the attended command, else `zsh <queue home>/lib.sh attended`
// A second route, POST /attended, answers the attended query's JSON from that command, so a
// session without Linear credentials can still compute its pick. No other query goes that way.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';

const env = process.env;
const home = env.AGENT_QUEUE_HOME ?? '';
const upstream = new URL(
  env.AGENT_QUEUE_LINEAR_PROXY_UPSTREAM || 'https://mcp.linear.app/mcp'
);
const headerCmd = env.AGENT_QUEUE_LINEAR_PROXY_HEADER
  ? [env.AGENT_QUEUE_LINEAR_PROXY_HEADER]
  : ['zsh', `${home}/lib.sh`, 'header'];
const attendedCmd = env.AGENT_QUEUE_LINEAR_ATTENDED
  ? [env.AGENT_QUEUE_LINEAR_ATTENDED]
  : ['zsh', `${home}/lib.sh`, 'attended'];
// The attended answer carries every open ticket's description
const ATTENDED_MAX = 32 * 1024 * 1024;
// lib.sh's own budget for a refused token is four 20 s calls, so the deadline sits above it
const ATTENDED_TIMEOUT = 120_000;
const MAX_BODY = 1024 * 1024;
// What a request may carry to Linear; the client's Authorization is never among them
const PASS_REQUEST = [
  'accept',
  'content-type',
  'mcp-session-id',
  'mcp-protocol-version',
  'last-event-id'
];
// fetch has already decoded the body, and node sets its own framing
const DROP_RESPONSE = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'transfer-encoding'
]);

const log = (line) => process.stderr.write(`linear-mcp-proxy: ${line}\n`);

const readTools = (file) =>
  new Set(
    readFileSync(file, 'utf8')
      .split('\n')
      .map((line) => line.replace(/#.*/, '').trim())
      .filter(Boolean)
  );

let allowed;
try {
  allowed = readTools(
    env.AGENT_QUEUE_LINEAR_PROXY_TOOLS || `${home}/linear-tools.txt`
  );
} catch (error) {
  log(`no tool list (${error.message})`);
  process.exit(1);
}
if (allowed.size === 0) {
  log('the tool list is empty');
  process.exit(1);
}

// One subprocess, its stdout as a string; a failure names the command, never its output
const runCommand = (what, [cmd, ...args], timeout, maxBuffer) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer }, (error, stdout) => {
      if (error) return reject(new Error(`the ${what} command failed`));
      resolve(stdout);
    });
  });

// The header, fetched once and shared; a refused one is replaced once by `header force`
let header;
const fetchHeader = async (force) => {
  const [cmd, ...args] = headerCmd;
  const stdout = await runCommand(
    'header',
    [cmd, ...(force ? [...args, 'force'] : args)],
    60_000
  );
  try {
    const value = JSON.parse(stdout).Authorization;
    if (typeof value === 'string' && value) return value;
  } catch {
    // reported below
  }
  throw new Error('the header command printed no Authorization');
};
const getHeader = (force = false) => {
  if (!header || force) {
    const pending = fetchHeader(force);
    header = pending;
    // A failure is not kept: the next request tries again
    pending.catch(() => {
      if (header === pending) header = undefined;
    });
  }
  return header;
};

const answer = (res, status, body, type = 'text/plain') => {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
};

// The attended query, never cached: its answer is the pick's input. Requests that overlap
// share the run in flight, so a burst of wakes costs Linear one query
let attendedPending;
const fetchAttended = () => {
  if (!attendedPending) {
    attendedPending = runCommand(
      'attended',
      attendedCmd,
      ATTENDED_TIMEOUT,
      ATTENDED_MAX
    )
      .then((stdout) => {
        try {
          JSON.parse(stdout);
        } catch {
          throw new Error('the attended command printed no JSON');
        }
        return stdout;
      })
      .finally(() => {
        attendedPending = undefined;
      });
  }
  return attendedPending;
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    // Past the limit the rest is read and dropped, so the client still gets its 400
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on('end', () =>
      size > MAX_BODY
        ? reject(new Error('body larger than 1 MB'))
        : resolve(Buffer.concat(chunks))
    );
    req.on('error', reject);
  });

const handle = async (req, res, port) => {
  // Only a client on this host, by name too: a page that rebinds a name to 127.0.0.1 is refused
  const host = req.headers.host;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
    return answer(res, 400, 'bad host\n');
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/attended' && req.method === 'POST') {
    // The route takes no input: whatever body comes is drained and dropped
    req.resume();
    try {
      return answer(res, 200, await fetchAttended(), 'application/json');
    } catch (error) {
      log(`attended failed (${error.message})`);
      return answer(res, 502, `${error.message}\n`);
    }
  }
  if (
    url.pathname !== '/mcp' ||
    !['POST', 'GET', 'DELETE'].includes(req.method)
  ) {
    return answer(res, 404, 'not found\n');
  }

  let body;
  if (req.method === 'POST') {
    let message;
    try {
      body = await readBody(req);
      message = JSON.parse(body.toString('utf8'));
    } catch {
      return answer(res, 400, 'the body is not JSON of at most 1 MB\n');
    }
    // MCP 2025-06-18 has no batches; refusing one means no call inside it goes unchecked
    if (
      message === null ||
      typeof message !== 'object' ||
      Array.isArray(message)
    ) {
      return answer(res, 400, 'one JSON-RPC message per request\n');
    }
    if (message.method === 'tools/call') {
      const name = message.params?.name;
      if (typeof name !== 'string' || !allowed.has(name)) {
        log(`refused tools/call ${String(name)}`);
        return answer(
          res,
          200,
          JSON.stringify({
            jsonrpc: '2.0',
            id: message.id ?? null,
            error: {
              code: -32601,
              message: `tool not allowed: ${String(name)}`
            }
          }),
          'application/json'
        );
      }
    }
  }

  const headers = {};
  for (const name of PASS_REQUEST) {
    const value = req.headers[name];
    if (typeof value === 'string') headers[name] = value;
  }
  const target = new URL(upstream);
  target.search = url.search;
  const aborter = new AbortController();
  res.on('close', () => aborter.abort());

  const send = async (authorization) =>
    fetch(target, {
      method: req.method,
      headers: { ...headers, authorization },
      body,
      signal: aborter.signal
    });

  let upstreamRes;
  try {
    let authorization = await getHeader();
    upstreamRes = await send(authorization);
    // Once: a refused token is bought again, unless another request already replaced it
    if (upstreamRes.status === 401) {
      await upstreamRes.body?.cancel();
      const current = await header?.catch(() => undefined);
      authorization =
        current && current !== authorization ? current : await getHeader(true);
      upstreamRes = await send(authorization);
    }
  } catch (error) {
    if (aborter.signal.aborted) return;
    log(`upstream failed (${error.message})`);
    return answer(
      res,
      502,
      `Linear's MCP could not be reached: ${error.message}\n`
    );
  }

  const out = {};
  for (const [name, value] of upstreamRes.headers) {
    if (!DROP_RESPONSE.has(name)) out[name] = value;
  }
  res.writeHead(upstreamRes.status, out);
  if (!upstreamRes.body) return res.end();
  // Streamed as it comes, so an SSE answer reaches claude event by event
  Readable.fromWeb(upstreamRes.body)
    .on('error', () => res.destroy())
    .pipe(res);
};

const server = createServer((req, res) => {
  handle(req, res, server.address().port).catch((error) => {
    log(`request failed (${error.message})`);
    if (!res.headersSent) answer(res, 500, 'proxy error\n');
    else res.destroy();
  });
});
server.listen(
  Number(env.AGENT_QUEUE_LINEAR_PROXY_PORT ?? 8790),
  '127.0.0.1',
  () => {
    const { port } = server.address();
    process.stdout.write(`linear-mcp-proxy: listening on 127.0.0.1:${port}\n`);
  }
);
// An open SSE stream would hold close() up
const stop = () => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
