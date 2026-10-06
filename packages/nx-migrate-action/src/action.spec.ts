import * as main from './lib/main';

// Mock the action's entrypoint
const runMock = vi.spyOn(main, 'run').mockResolvedValue();

describe('index action', () => {
  it('should call run when imported', async () => {
    await import('./action');
    expect(runMock).toHaveBeenCalled();
  });
});
