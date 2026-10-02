import type {
  CheckOutcome,
  CheckResult
} from '@codeware/shared/ui/component-studio';
import type {
  ComponentDiagnostic,
  ComponentProp,
  ComponentPropKind
} from '@codeware/shared/util/payload-utils';

const propKinds = {
  string: true,
  number: true,
  boolean: true,
  other: true
} as const satisfies Record<ComponentPropKind, true>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isDiagnostic = (value: unknown): value is ComponentDiagnostic =>
  isRecord(value) &&
  typeof value['message'] === 'string' &&
  typeof value['line'] === 'number' &&
  typeof value['column'] === 'number' &&
  (value['severity'] === 'error' || value['severity'] === 'warning');

const isPropKind = (value: unknown): value is ComponentPropKind =>
  typeof value === 'string' && Object.hasOwn(propKinds, value);

const isProp = (value: unknown): value is ComponentProp =>
  isRecord(value) &&
  typeof value['name'] === 'string' &&
  isPropKind(value['kind']) &&
  typeof value['optional'] === 'boolean';

/** Reads the endpoint's answer; null when it is not one. */
export const parseCheckResult = (value: unknown): CheckResult | null => {
  if (
    !isRecord(value) ||
    typeof value['ok'] !== 'boolean' ||
    !Array.isArray(value['diagnostics'])
  ) {
    return null;
  }
  const diagnostics = value['diagnostics'].filter(isDiagnostic);
  const props = Array.isArray(value['props'])
    ? value['props'].filter(isProp)
    : undefined;
  return { ok: value['ok'], diagnostics, ...(props ? { props } : {}) };
};

type RequestArgs = {
  /** The api route, relative to the admin's origin */
  apiRoute: string;
  body: {
    source: string;
    slug?: string;
    propsSchema?: ReadonlyArray<{
      name: string;
      type: string;
      required: boolean;
    }>;
  };
};

/** Asks the server to build the unsaved source. Never rejects. */
export const requestCheck = async ({
  apiRoute,
  body
}: RequestArgs): Promise<CheckOutcome> => {
  try {
    const response = await fetch(`${apiRoute}/custom-components/check`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (response.status === 401 || response.status === 403) {
      return { status: 'forbidden' };
    }
    if (!response.ok) {
      return { status: 'failed' };
    }
    const result = parseCheckResult(await response.json());
    return result ? { status: 'done', result } : { status: 'failed' };
  } catch (error) {
    console.warn('The component check could not be run', error);
    return { status: 'failed' };
  }
};
