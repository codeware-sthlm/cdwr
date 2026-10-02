import {
  getComponentDeveloperTenantIDs,
  hasRole
} from '@codeware/app-cms/util/misc';
import {
  type ComponentSourceBody,
  MAX_COMPONENT_SOURCE_LENGTH,
  componentTagName,
  parseComponentSource
} from '@codeware/shared/util/payload-utils';
import { StatusCodes, getReasonPhrase } from 'http-status-codes';
import type { Endpoint, PayloadRequest } from 'payload';

import { inBuildTurn } from '../../jobs/build-turn';
import { hasErrors, runComponentBuild } from '../../jobs/run-component-build';

/** Largest source the check accepts, in characters */
export const MAX_CHECK_SOURCE_LENGTH = MAX_COMPONENT_SOURCE_LENGTH;

/** Stands in for the tag name when the form has no usable slug */
const PLACEHOLDER_SLUG = 'check';

const SLUG_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

type CheckBody = ComponentSourceBody & { slug?: string };

const fail = (status: StatusCodes, message?: string) =>
  Response.json({ error: message ?? getReasonPhrase(status) }, { status });

/** Validates the request body; a string is the reason it was refused. */
export const parseCheckBody = (body: unknown): CheckBody | string => {
  const parsed = parseComponentSource(body);
  if (typeof parsed === 'string') {
    return parsed;
  }

  // The parse above proved the body is an object
  const slug =
    typeof body === 'object' && body !== null && 'slug' in body
      ? body.slug
      : undefined;
  return slug === undefined || typeof slug === 'string'
    ? { ...parsed, slug }
    : '`slug` must be a string.';
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
