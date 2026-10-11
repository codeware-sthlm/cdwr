import * as exec from '@actions/exec';

/**
 * Run git and return trimmed stdout.
 *
 * @param args - Git arguments
 * @param ignoreReturnCode - Return stdout instead of throwing on a non-zero exit
 */
export const git = async (
  args: string[],
  ignoreReturnCode = false
): Promise<string> => {
  const { stdout } = await exec.getExecOutput('git', args, {
    silent: true,
    ignoreReturnCode
  });
  return stdout.trim();
};
