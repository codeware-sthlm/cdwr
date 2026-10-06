import { PassThrough } from 'node:stream';

import type { EntryContext } from '@remix-run/node';
import { createReadableStreamFromReadable } from '@remix-run/node';
import { RemixServer } from '@remix-run/react';
import { isbot } from 'isbot';
import { renderToPipeableStream } from 'react-dom/server';

import { NonceProvider } from './utils/nonce-provider';
import type { AppLoadContext } from './utils/types';

const ABORT_DELAY = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
  loadContext: AppLoadContext
) {
  const prohibitOutOfOrderStreaming =
    isBotRequest(request.headers.get('user-agent')) || remixContext.isSpaMode;

  return prohibitOutOfOrderStreaming
    ? handleBotRequest(
        request,
        responseStatusCode,
        responseHeaders,
        remixContext,
        loadContext.cspNonce
      )
    : handleBrowserRequest(
        request,
        responseStatusCode,
        responseHeaders,
        remixContext,
        loadContext.cspNonce
      );
}

function isBotRequest(userAgent: string | null) {
  return userAgent ? isbot(userAgent) : false;
}

function handleBotRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
  nonce: string
) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const { pipe, abort } = renderToPipeableStream(
      <NonceProvider value={nonce}>
        <RemixServer
          context={remixContext}
          url={request.url}
          abortDelay={ABORT_DELAY}
          nonce={nonce}
        />
      </NonceProvider>,
      {
        nonce,
        onAllReady() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set('Content-Type', 'text/html');

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // Log streaming rendering errors from inside the shell.  Don't log
          // errors encountered during initial shell rendering since they'll
          // reject and get logged in handleDocumentRequest.
          if (shellRendered) {
            console.error(error);
          }
        }
      }
    );

    setTimeout(abort, ABORT_DELAY);
  });
}

function handleBrowserRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
  nonce: string
) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const { pipe, abort } = renderToPipeableStream(
      <NonceProvider value={nonce}>
        <RemixServer
          context={remixContext}
          url={request.url}
          abortDelay={ABORT_DELAY}
          nonce={nonce}
        />
      </NonceProvider>,
      {
        nonce,
        onShellReady() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set('Content-Type', 'text/html');

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // Log streaming rendering errors from inside the shell.  Don't log
          // errors encountered during initial shell rendering since they'll
          // reject and get logged in handleDocumentRequest.
          if (shellRendered) {
            console.error(error);
          }
        }
      }
    );

    setTimeout(abort, ABORT_DELAY);
  });
}
