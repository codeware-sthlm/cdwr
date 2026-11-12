import { pathToFileURL } from 'url';

import { input } from '../../cli/inputs';
import { resolveDefinition } from '../../services/site-definitions';

import {
  type RoutedDefinition,
  isRoutedDefinition,
  parseRoutes,
  routesOf
} from './snapshot.logic';

/** What `snapshot` and `audit` share: the pages to visit and the way in */

export const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

async function loadDefinition(path: string): Promise<RoutedDefinition> {
  const imported = (await import(pathToFileURL(path).href)) as {
    default?: unknown;
  };
  if (!isRoutedDefinition(imported.default)) {
    throw new Error(
      `${path} does not export a site definition with pages as its default`
    );
  }
  return imported.default;
}

/** `--routes` when given, otherwise the pages of the definition */
export async function routesFrom(
  root: string,
  routes: string | undefined,
  definition: string | undefined
): Promise<Array<string>> {
  if (routes?.trim()) {
    return parseRoutes(routes);
  }
  if (!definition) {
    throw new Error('Name a definition, or pass --routes');
  }
  return routesOf(
    await loadDefinition(await resolveDefinition(root, definition))
  );
}

/** How long the first request may take: a dev server compiles on demand */
const FIRST_ANSWER_MS = 60_000;

/**
 * Fails early and plainly when there is no site to look at.
 *
 * Nothing listening and a server still compiling its first page need different
 * advice, and only the timeout tells them apart: a refused connection is
 * immediate.
 */
export async function assertAnswers(url: string): Promise<void> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(FIRST_ANSWER_MS) });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error(
        `${url} did not answer within ${FIRST_ANSWER_MS / 1000}s. A dev server compiles a page on its first request; open it once, then run this again.`
      );
    }
    throw new Error(
      `Nothing answers at ${url}. Start the site first, for example with \`nx dev cms\`.`
    );
  }
}

/** The gate password, flag only: without it a gated site shows its gate page */
export const gatePasswordInput = () =>
  input.secret({
    prompt: 'Site gate password?',
    short: 'P',
    description:
      "The site's gate password (SITE_GATE_PASSWORD), to see a gated site as an invited visitor",
    optional: true,
    flagOnly: true
  });
