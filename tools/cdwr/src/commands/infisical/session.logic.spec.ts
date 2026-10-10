import { InfisicalMissingError } from '@codeware/shared/util/infisical-cli';

import { probeSession } from './session.logic';

describe('probeSession', () => {
  it('is ok when the listing answers', () => {
    const run = vi.fn().mockReturnValue('[]');
    expect(probeSession('development', run)).toEqual({ state: 'ok' });
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]?.[0]).toContain('--path=/');
  });

  it('reports a missing CLI', () => {
    const run = vi.fn(() => {
      throw new InfisicalMissingError();
    });
    expect(probeSession('development', run).state).toBe('not-installed');
  });

  it('lists the root once without recursing into folders', () => {
    const run = vi.fn().mockReturnValue('[{"folderName":"apps"}]');
    probeSession('development', run);
    expect(run).toHaveBeenCalledOnce();
  });

  it('reports any other failure with its message and the login hint', () => {
    const run = vi.fn(() => {
      throw new Error('exit 1');
    });
    expect(probeSession('development', run)).toMatchObject({
      state: 'failed',
      message: 'Infisical CLI check failed: exit 1',
      hint: expect.stringContaining('infisical login')
    });
  });

  it('does not echo output that is not JSON', () => {
    const run = vi.fn().mockReturnValue('SECRET-SENTINEL');
    const state = probeSession('development', run);
    expect(state.state).toBe('failed');
    expect(JSON.stringify(state)).not.toContain('SECRET-SENTINEL');
  });
});
