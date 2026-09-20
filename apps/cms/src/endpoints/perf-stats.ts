import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { canEdit } from '@codeware/app-cms/util/misc';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import { type Endpoint, type PayloadRequest, headersWithCors } from 'payload';

import {
  readQueryStats,
  resetQueryStats,
  setCollecting
} from '../perf/query-stats';

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"]/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char
  );

/** Scannable view for the common case: opening this straight from the URL bar */
function renderHtml(stats: ReturnType<typeof readQueryStats>): string {
  const rows = stats.shapes
    .map(
      ({ count, shape }) => `<tr>
        <td class="n">${count}</td>
        <td><code>${escapeHtml(shape)}</code></td>
      </tr>`
    )
    .join('');

  const empty = stats.collecting
    ? '<p class="hint">No queries recorded yet — go use the admin, then Refresh.</p>'
    : '<p class="hint">Press Start, exercise the admin UI, then come back and Refresh.</p>';

  return `<!doctype html>
<meta charset="utf-8">
<title>Query profiler</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.6 ui-monospace, monospace; margin: 2rem; max-width: 70rem; }
  h1 { font-size: 1.1rem; margin-bottom: .25rem; }
  .lede { font-family: system-ui, sans-serif; max-width: 46rem; }
  .lede p { margin: .5rem 0; }
  .bar { display: flex; gap: .5rem; margin: 1.25rem 0; flex-wrap: wrap; }
  .bar a { padding: .3rem .7rem; border: 1px solid currentColor; border-radius: 4px; text-decoration: none; color: inherit; }
  .bar a.back { opacity: .7; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  td, th { border-bottom: 1px solid rgba(128,128,128,.3); padding: .4rem .6rem; text-align: left; vertical-align: top; }
  .n { text-align: right; font-weight: 700; white-space: nowrap; }
  code { white-space: pre-wrap; word-break: break-all; }
  .idle { opacity: .6; }
  .hint, .meta { opacity: .7; }
  .meta { font-family: system-ui, sans-serif; }
</style>
<h1>Query profiler — ${stats.collecting ? 'collecting' : '<span class="idle">idle</span>'}</h1>
<div class="lede">
  <p>Counts every database query the CMS runs and groups them by shape, ignoring
  the arguments. A high count next to one row means that query ran many times to
  render a single page — usually a lookup that should have been cached or batched.</p>
  <p>That is the whole trick: Payload re-runs access control and afterRead hooks
  per collection per operation, so one admin page can quietly fan out into
  hundreds of identical reads. Sorting by count makes them obvious. Shapes
  repeating more than 25 times also log a <code>[PERF]</code> warning to the dev
  console, so you do not have to keep checking this page.</p>
  <p class="meta">Development only, and off until you start it.</p>
</div>
<div class="bar">
  <a href="?start">Start</a>
  <a href="?stop">Stop</a>
  <a href="?reset">Reset</a>
  <a href="?">Refresh</a>
  <a class="back" href="/admin">← Back to admin</a>
</div>
<p class="meta">${stats.total} queries · ${stats.distinctShapes} distinct shapes · ${Math.round(stats.windowMs / 1000)}s window</p>
${stats.shapes.length ? `<table><tr><th class="n">count</th><th>query shape</th></tr>${rows}</table>` : empty}`;
}

/**
 * Database query profiler, development only.
 *
 * Open it in the browser, hit Start, exercise the admin UI, then Refresh —
 * queries are grouped by shape so repeated identical ones stand out.
 */
export const perfStatsEndpoint: Endpoint = {
  path: '/perf-stats',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    const headers = headersWithCors({ headers: new Headers(), req });

    const fail = (status: number) =>
      Response.json({ error: getReasonPhrase(status) }, { status, headers });

    // Never expose profiling outside local development
    if (getEnv().DEPLOY_ENV !== 'development') {
      return fail(StatusCodes.NOT_FOUND);
    }

    // Admin-session users only; API key clients have no business reading this
    if (!canEdit(req.user)) {
      return fail(StatusCodes.FORBIDDEN);
    }

    if (req.searchParams.has('start')) {
      setCollecting(true);
    } else if (req.searchParams.has('stop')) {
      setCollecting(false);
    } else if (req.searchParams.has('reset')) {
      resetQueryStats();
    }

    const stats = readQueryStats(
      Number(req.searchParams.get('limit')) || undefined
    );

    // Browsers navigating here get the table; curl and fetch get JSON
    if (req.headers.get('accept')?.includes('text/html')) {
      headers.set('content-type', 'text/html; charset=utf-8');
      return new Response(renderHtml(stats), {
        status: StatusCodes.OK,
        headers
      });
    }

    return Response.json(stats, { status: StatusCodes.OK, headers });
  }
};
