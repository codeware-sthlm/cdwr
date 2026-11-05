import { loadSiteOrigin, loadSitemapEntries } from './sitemap-entries';

vi.mock('@codeware/shared/util/payload-api');

const boom = new Error('no env');
const throwing = () => {
  throw boom;
};

describe('sitemap entries', () => {
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    error = vi.spyOn(console, 'error').mockImplementation(() => {
      // silence
    });
  });

  afterEach(() => {
    error.mockRestore();
  });

  it('lists nothing when the context cannot be built', async () => {
    await expect(loadSitemapEntries(throwing)).resolves.toEqual({
      origin: null,
      entries: []
    });
    expect(error).toHaveBeenCalledWith('Failed to load sitemap entries:', boom);
  });

  it('has no origin when the context cannot be built', async () => {
    await expect(loadSiteOrigin(throwing)).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith('Failed to load the site origin:', boom);
  });
});
