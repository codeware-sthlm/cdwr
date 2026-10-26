import { type Env, EnvSchema } from './env.schema';

let resolved: Env | undefined;

/**
 * The validated environment. Server code only: the `.server` suffix keeps this
 * file, and the tenant api key it carries, out of the client bundle.
 *
 * @throws When a variable is missing or invalid
 */
export function getEnv(): Env {
  if (resolved) {
    return resolved;
  }

  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(
      `Invalid environment variables: ${JSON.stringify(result.error.flatten().fieldErrors)}`
    );
  }

  resolved = result.data;
  return resolved;
}
