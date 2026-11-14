import { z } from 'zod';

type Options = {
  /**
   * Dot notation paths that should preserve their values
   * without being transformed.
   *
   * Dot notation is expressed with transformed schema keys.
   *
   * @example
   *
   * Typical use case is when the source data contains environment variables
   * which we want to preserve as objects.
   *
   * ```ts
   * [ 'machines.config.env' ]
   * ```
   */
  preserve?: string[];

  /**
   * Properties that should always be transformed to a specific value.
   *
   * Map the source key to the desired property key.
   *
   * @example
   *
   * Source data contains property `APIKey` which should always be transformed to `apiKey`.
   * Default transformation would otherwise turn it into `aPIKey`.
   *
   * ```ts
   * { APIKey: 'apiKey' }
   * ```
   */
  specialCases?: Record<string, string>;
};

// Enhanced helper function to handle multi-word uppercase strings
const toCamelCase = (
  str: string,
  specialCases: Record<string, string> = {}
): string => {
  // Check special cases first to lookup by source key
  if (specialCases[str]) {
    return specialCases[str];
  }

  // Handle snake_case
  if (str.includes('_')) {
    return str
      .toLowerCase()
      .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  // Handle uppercased keys
  if (str === str.toUpperCase()) {
    return str.toLowerCase();
  }

  // Handle PascalCase
  return str.charAt(0).toLowerCase() + str.slice(1);
};

// Recursive function to transform all nested keys
const transformKeys = (options: {
  currentPath: Array<string>;
  data: unknown;
  preserve: Array<string>;
  specialCases: Record<string, string>;
}): unknown => {
  const { currentPath, data, preserve, specialCases } = options;

  // Recurse transform arrays
  if (Array.isArray(data)) {
    // Array keeps the current path
    return data.map((item) =>
      transformKeys({
        currentPath,
        data: item,
        preserve,
        specialCases
      })
    );
  }

  // Recurse transform objects
  if (data && typeof data === 'object' && data !== null) {
    // Spreading an accumulator would copy every key already collected on each
    // iteration, making the walk quadratic; `fromEntries` stays linear.
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => {
        // Check if current key is within the value of a key to preserve.
        // For example `path.to.env` should preserve `env` object,
        // and transform the `env` key to camelCase when needed.
        // `preserve` holds dot-notation paths, so match on the separator
        // directly — building a RegExp from them would break on metacharacters.
        const fullPath = [...currentPath, key].join('.');
        const shouldPreserveValue = preserve.some((path) =>
          fullPath.startsWith(`${path}.`)
        );

        const newKey = shouldPreserveValue
          ? key
          : toCamelCase(key, specialCases);

        // Store transformed paths to let `preserve` option
        // support target schema paths.
        const newPath = [...currentPath, newKey];

        return [
          newKey,
          transformKeys({
            currentPath: newPath,
            data: value,
            preserve,
            specialCases
          })
        ];
      })
    );
  }

  return data;
};

/**
 * A Zod preprocessor which will deeply transform the keys of an object to camelCase.
 *
 * Handles nested objects and arrays.
 *
 * @example
 * ```ts
 * const schema = z.object({
 *   id: z.string(),
 *   apiKey: z.string(),
 *   userId: z.string(),
 *   machines: z.array(
 *     z.object({
 *       config: z.object({
 *         env: z.record(z.string(), z.string()),
 *       })
 *     })
 *   ),
 *   machineToken: z.string()
 * })
 *
 * // Default transformation
 * const transformed = withCamelCase(schema);
 *
 * // When `env` contains environment variables, we want to preserve the object as is.
 * // Paths should be expressed with dot notation.
 * const transformed = withCamelCase(schema, {
 *   preserve: ['machines.config.env']
 * });
 *
 * // Let's say the source data for api key is `APIKey`, the default transformation would become `apPIey`.
 * // Use `specialCases` options to add a custom rule for `apiKey`.
 * const transformed = withCamelCase(schema, {
 *   specialCases: {
 *     APIKey: 'apiKey'
 *   }
 * });
 * ```
 */
export const withCamelCase = <T extends z.ZodType>(
  schema: T,
  options: Options = {}
) => {
  const { preserve = [], specialCases = {} } = options;

  return z.preprocess(
    (data: unknown) =>
      transformKeys({
        currentPath: [],
        data,
        preserve,
        specialCases
      }),
    schema
  );
};
