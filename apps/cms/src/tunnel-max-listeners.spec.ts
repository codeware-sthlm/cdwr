/** @jest-environment node */
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  TUNNEL_MAX_LISTENERS,
  raiseTunnelMaxListeners
} from './tunnel-max-listeners';

describe('raiseTunnelMaxListeners', () => {
  let server: Server;
  let baseUrl: string;
  let undo: () => void;

  beforeAll(async () => {
    undo = raiseTunnelMaxListeners();
    server = createServer((_req, res) =>
      res.end(String(res.getMaxListeners()))
    );
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    undo();
    await new Promise((resolve) => server.close(resolve));
  });

  const maxListeners = async (path: string) =>
    Number(await (await fetch(`${baseUrl}${path}`)).text());

  it.each(['/monitoring', '/monitoring?o=1&p=2&r=de', '/monitoring/?o=1'])(
    'raises the limit for %s',
    async (path) => {
      expect(await maxListeners(path)).toBe(TUNNEL_MAX_LISTENERS);
    }
  );

  it.each(['/', '/admin', '/api/monitoring', '/monitoring-other'])(
    'keeps the default for %s',
    async (path) => {
      expect(await maxListeners(path)).toBe(10);
    }
  );
});
