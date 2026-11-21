import { readFile } from 'fs/promises';
import { type Server, createServer } from 'http';
import { extname, join, resolve, sep } from 'path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
};

/** A file server for a built Storybook, on a free port of the loopback address */
export async function serveStatic(
  directory: string
): Promise<{ url: string; server: Server }> {
  const root = resolve(directory);

  const server = createServer((request, response) => {
    void (async () => {
      try {
        const { pathname } = new URL(request.url ?? '/', 'http://localhost');
        const path = resolve(join(root, decodeURIComponent(pathname)));
        if (path !== root && !path.startsWith(root + sep)) {
          throw new Error('outside the root');
        }
        const body = await readFile(
          path === root ? join(root, 'index.html') : path
        );
        response.writeHead(200, {
          'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream'
        });
        response.end(body);
      } catch {
        response.writeHead(404).end();
      }
    })();
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The file server has no port');
  }
  return { url: `http://127.0.0.1:${address.port}`, server };
}
