import { loadSiteData } from './load-site';
import { testContext } from './test-context';

vi.mock('@codeware/shared/util/payload-api');

const failure = {
  ok: false,
  message: 'Unable to load application content. Please try again later.'
};

describe('loadSiteData', () => {
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    error = vi.spyOn(console, 'error').mockImplementation(() => {
      // silence
    });
  });

  afterEach(() => {
    error.mockRestore();
  });

  it('logs and returns a failure when the tenant has no config', async () => {
    await expect(loadSiteData(() => testContext())).resolves.toEqual(failure);
    expect(error).toHaveBeenCalledWith(
      'Failed to load site content:',
      expect.any(Error)
    );
  });

  it('logs and returns a failure when the context cannot be built', async () => {
    const boom = new Error('no env');

    await expect(
      loadSiteData(() => {
        throw boom;
      })
    ).resolves.toEqual(failure);
    expect(error).toHaveBeenCalledWith('Failed to load site content:', boom);
  });
});
