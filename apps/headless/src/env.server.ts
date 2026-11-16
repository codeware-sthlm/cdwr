import { type Env, EnvSchema } from '@codeware/app-headless/util/env-schema';
import type { z } from 'zod';

let resolved: Env | undefined;

// Each variable with the schema's reason, never its value: the message ends up
// in deploy logs and Sentry
const formatIssues = (error: z.ZodError): string[] =>
  error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

/** Names each invalid variable with the schema's reason, never its value */
export function describeEnvIssues(env: NodeJS.ProcessEnv): string[] {
  const result = EnvSchema.safeParse(env);
  return result.success ? [] : formatIssues(result.error);
}

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
      `Invalid environment variables: ${formatIssues(result.error).join('; ')}`
    );
  }

  resolved = result.data;
  return resolved;
}

/**
 * Exits when the environment is invalid, so a deploy fails at boot with the
 * reason instead of timing out on a health check that throws.
 */
export function exitOnInvalidEnv(
  env: NodeJS.ProcessEnv = process.env,
  exit: (code: number) => void = process.exit
): void {
  const issues = describeEnvIssues(env);
  if (issues.length === 0) {
    return;
  }
  console.error(
    ['Invalid environment variables, exiting:', ...issues].join('\n  ')
  );
  exit(1);
}
