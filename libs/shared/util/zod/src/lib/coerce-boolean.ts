import { z } from 'zod';

/**
 * Coerce to boolean with a default value for empty/missing values.
 *
 * Useful for environment variables where empty strings or missing values should use the default.
 * Accepts boolean values directly, and coerces the lowercase strings 'true'/'false' to booleans.
 *
 * @param defaultValue - The default boolean value (true or false)
 * @returns Zod schema that coerces to boolean with the specified default
 *
 * @example
 * ```ts
 * const schema = z.object({
 *   FEATURE_FLAG: coerceBoolean(false)
 * });
 * // undefined, null, '', or '  ' → false (default)
 * // true → true
 * // false → false
 * // 'true' → true
 * // 'false' → false
 * // 'TRUE', 'False', 'yes' → validation error
 * ```
 */
export const coerceBoolean = (defaultValue: boolean) =>
  z.preprocess(
    (val) => {
      // Handle missing/empty values
      if (val == null || val === '') {
        return defaultValue;
      }
      // Handle whitespace-only strings
      if (typeof val === 'string' && val.trim() === '') {
        return defaultValue;
      }
      // Pass through boolean values
      if (typeof val === 'boolean') {
        return val;
      }
      // Pass through string values for validation
      return val;
    },
    z.union([
      z.boolean(),
      z.enum(['true', 'false']).transform((val) => val === 'true')
    ])
  );
