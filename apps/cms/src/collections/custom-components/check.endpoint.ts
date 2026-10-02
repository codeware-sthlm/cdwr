import {
  getComponentDeveloperTenantIDs,
  hasRole
} from '@codeware/app-cms/util/misc';
import type { CustomComponent } from '@codeware/shared/util/payload-types';
import { componentTagName } from '@codeware/shared/util/payload-utils';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import type { Endpoint, PayloadRequest } from 'payload';

import { inBuildTurn } from '../../jobs/build-turn';
import { hasErrors, runComponentBuild } from '../../jobs/run-component-build';

/** Largest source the check accepts, in characters */
export const MAX_CHECK_SOURCE_LENGTH = 200_000;

/** Stands in for the tag name when the form has no usable slug */
const PLACEHOLDER_SLUG = 'check';

const SLUG_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const PROP_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

type PropDeclaration = NonNullable<CustomComponent['propsSchema']>[number];

/** The type each prop declaration may carry, keyed so a new one must be listed */
const propTypes = {
  text: true,
  textarea: true,
  number: true,
  checkbox: true
} as const satisfies Record<PropDeclaration['type'], true>;

const isPropType = (value: unknown): value is PropDeclaration['type'] =>
  typeof value === 'string' && Object.hasOwn(propTypes, value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type CheckBody = {
  source: string;
  slug?: string;
  propsSchema?: PropDeclaration[];
};

const fail = (status: StatusCodes, message?: string) =>
  Response.json({ error: message ?? getReasonPhrase(status) }, { status });

/**
 * Reads the declarations, or null when an entry is malformed. A row whose name
 * is not a prop name yet, such as one still being typed, is left out.
 */
const parsePropsSchema = (value: unknown): PropDeclaration[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const declarations: PropDeclaration[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry['name'] !== 'string' ||
      !isPropType(entry['type'])
    ) {
      return null;
    }
    if (!PROP_NAME_PATTERN.test(entry['name'])) {
      continue;
    }
    declarations.push({
      name: entry['name'],
      type: entry['type'],
      required: entry['required'] === true
    });
  }
  return declarations;
};

/** Validates the request body; a string is the reason it was refused. */
export const parseCheckBody = (body: unknown): CheckBody | string => {
  if (!isRecord(body) || typeof body['source'] !== 'string') {
    return 'The body needs a `source` string.';
  }
  if (body['source'].length > MAX_CHECK_SOURCE_LENGTH) {
    return `The source is larger than ${MAX_CHECK_SOURCE_LENGTH} characters.`;
  }

  const { slug, propsSchema } = body;
  if (slug !== undefined && typeof slug !== 'string') {
    return '`slug` must be a string.';
  }

  if (propsSchema === undefined) {
    return { source: body['source'], slug };
  }
  const declarations = parsePropsSchema(propsSchema);
  return declarations
    ? { source: body['source'], slug, propsSchema: declarations }
    : '`propsSchema` must list entries with a name and a valid type.';
};

/** System users, or users who hold the developer flag in some workspace. */
const mayCheck = (user: PayloadRequest['user']): boolean =>
  hasRole(user ?? null, 'system-user') ||
  getComponentDeveloperTenantIDs(user ?? null).length > 0;

/**
 * Builds source that has not been saved, and reports what the build found.
 *
 * Never returns the compiled code. Goes through the same build and the same
 * queue as a saved component's build, so a check cannot run alongside one.
 */
export const customComponentCheckEndpoint: Endpoint = {
  path: '/check',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!mayCheck(req.user)) {
      return fail(StatusCodes.FORBIDDEN);
    }

    let raw: unknown;
    try {
      raw = await req.json?.();
    } catch {
      return fail(StatusCodes.BAD_REQUEST, 'The body is not valid JSON.');
    }

    const body = parseCheckBody(raw);
    if (typeof body === 'string') {
      return fail(StatusCodes.BAD_REQUEST, body);
    }

    const slug =
      body.slug && SLUG_PATTERN.test(body.slug) ? body.slug : PLACEHOLDER_SLUG;

    try {
      const result = await inBuildTurn(() =>
        runComponentBuild({
          tagName: componentTagName(slug),
          source: body.source,
          propsSchema: body.propsSchema
        })
      );

      return Response.json({
        ok: !hasErrors(result.diagnostics),
        diagnostics: result.diagnostics,
        ...(result.ok && result.props ? { props: result.props } : {})
      });
    } catch (error) {
      req.payload.logger.error(
        { err: error },
        '[customComponents] The check failed unexpectedly'
      );
      return fail(StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }
};
