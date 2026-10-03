import type { EditorTypes } from '@codeware/shared/ui/component-studio';

/** Written by `nx studio-types cms`, which `dev` and `build` run first */
const TYPES_URL = '/studio-types.json';

const isRecordOfStrings = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  Object.values(value).every((entry) => typeof entry === 'string');

const isEditorTypes = (value: unknown): value is EditorTypes =>
  typeof value === 'object' &&
  value !== null &&
  'version' in value &&
  typeof value.version === 'string' &&
  'files' in value &&
  isRecordOfStrings(value.files) &&
  'paths' in value &&
  typeof value.paths === 'object' &&
  value.paths !== null;

/**
 * The declarations the editor type-checks against, or null when the admin
 * has none to offer: the studio then stays syntax-only, and the build keeps
 * being the type authority either way.
 */
export const loadEditorTypes = async (): Promise<EditorTypes | null> => {
  const response = await fetch(TYPES_URL);
  if (!response.ok) {
    return null;
  }
  const body: unknown = await response.json();
  return isEditorTypes(body) ? body : null;
};
