import { findDoc } from '@codeware/shared/util/payload-api';

import { loadDocData } from './load-doc';
import { testContext } from './test-context';

vi.mock('@codeware/shared/util/payload-api');

describe('loadDocData', () => {
  it('is a miss, without asking the cms, for an unresolvable path', async () => {
    const result = await loadDocData(() => testContext(), {
      splat: '',
      locale: 'en'
    });

    expect(result).toEqual({ ok: true, docJson: null });
    expect(findDoc).not.toHaveBeenCalled();
  });

  it('logs and returns a failure when the context cannot be built', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {
      // silence
    });
    const boom = new Error('no env');

    await expect(
      loadDocData(
        () => {
          throw boom;
        },
        { splat: 'about', locale: 'en' }
      )
    ).resolves.toEqual({
      ok: false,
      message: 'Unable to load the page. Please try again later.'
    });
    expect(error).toHaveBeenCalledWith('Failed to load document:', boom);

    error.mockRestore();
  });
});
