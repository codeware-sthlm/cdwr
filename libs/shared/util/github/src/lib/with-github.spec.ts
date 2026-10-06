import { RequestError } from '@octokit/request-error';

import { withGitHub } from './with-github';

const requestError = (status: number) =>
  new RequestError('Not Found', status, {
    request: {
      method: 'GET',
      url: 'https://api.github.com/repos/org/repo',
      headers: {}
    }
  });

describe('withGitHub', () => {
  it('returns the operation result', async () => {
    await expect(withGitHub(async () => 'ok')).resolves.toBe('ok');
  });

  // Guards that `instanceof RequestError` matches the class octokit throws
  it('returns null on a 404 RequestError with not-found-returns-null', async () => {
    const result = await withGitHub(async () => {
      throw requestError(404);
    }, 'not-found-returns-null');

    expect(result).toBeNull();
  });

  it('throws on a 404 RequestError without the option', async () => {
    await expect(
      withGitHub(async () => {
        throw requestError(404);
      })
    ).rejects.toThrow('Requested information was not found.');
  });

  it('rethrows unknown errors untouched', async () => {
    const error = new Error('boom');

    await expect(
      withGitHub(async () => {
        throw error;
      })
    ).rejects.toBe(error);
  });
});
