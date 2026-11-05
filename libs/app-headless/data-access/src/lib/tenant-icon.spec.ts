import { loadTenantMark } from './tenant-icon';

describe('loadTenantMark', () => {
  it('has no mark when the context cannot be built', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {
      // silence
    });
    const boom = new Error('no env');

    await expect(
      loadTenantMark(() => {
        throw boom;
      })
    ).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(
      'Failed to load the tenant config:',
      boom
    );

    error.mockRestore();
  });
});
