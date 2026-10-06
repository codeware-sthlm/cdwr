import type { context } from '@actions/github';
import type { Environment } from '@codeware/shared/util/nx-deploy';

type Context = typeof context;

/**
 * Get the environment to use for deployment.
 *
 * When the environment is null, a reason is also provided.
 *
 * @param context GitHub context
 * @param mainBranch Main branch
 * @returns Environment to use for deployment or null if unsupported
 */
export const getDeployEnv = (
  context: Context,
  mainBranch: string
): { environment: Environment } | { environment: null; reason: string } => {
  try {
    const { eventName, ref } = context;

    const currentBranch = ref.split('/').at(-1);

    if (eventName === 'pull_request') {
      return { environment: 'preview' };
    }

    if (eventName === 'push') {
      if (currentBranch === mainBranch) {
        return { environment: 'production' };
      }

      return {
        environment: null,
        reason: `'${currentBranch}' is not supported for production deployment, only '${mainBranch}' is supported`
      };
    }

    if (eventName === 'workflow_dispatch') {
      return {
        environment: null,
        reason:
          'Manual deployment triggered - environment will be determined by workflow inputs'
      };
    }

    return {
      environment: null,
      reason: `'${eventName}' is not a supported event for deployment, only 'pull_request', 'push', and 'workflow_dispatch' are supported`
    };
  } catch (error) {
    return {
      environment: null,
      reason: `Failed to determine deploy environment: ${
        error instanceof Error ? error.message : String(error)
      }`
    };
  }
};
