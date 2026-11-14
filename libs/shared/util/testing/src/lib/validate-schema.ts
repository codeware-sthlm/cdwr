import { z } from 'zod';

export type ValidationError = {
  path: PropertyKey[];
  code: string;
  message: string;
};

export type ValidationResult = {
  success: boolean;
  details?: string;
  parsed?: unknown;
  errors?: ValidationError[];
};

/**
 * @internal
 * Validates a schema against a fixture.
 *
 * @param schema - The schema to validate against
 * @param data - The fixture data to validate
 * @param options - Additional options
 * @returns A validation result
 */
export function validateSchema<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  options: { name?: string } = {}
): ValidationResult {
  const schemaName = options.name || 'Schema';

  try {
    const parsed = schema.parse(data);
    return {
      success: true,
      details: `${schemaName} validation passed`,
      parsed
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        details: `${schemaName} validation failed`,
        errors: error.issues.map((err) => ({
          path: err.path,
          code: err.code,
          message: err.message
        }))
      };
    }

    return {
      success: false,
      details: `Unexpected error: ${error}`
    };
  }
}
