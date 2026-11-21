/** @jest-environment node */
import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { guardSubmit } from '@codeware/shared/util/human-check';
import { NextRequest } from 'next/server';

import { refuseUnlessHuman } from './public-submit';

jest.mock('@codeware/app-cms/feature/env-loader', () => ({
  getEnv: jest.fn()
}));
jest.mock('@codeware/shared/util/human-check', () => ({
  guardSubmit: jest.fn(),
  guardHeaders: jest.fn(() => ({}))
}));

const request = () => new NextRequest('http://localhost/api/anything');

describe('refuseUnlessHuman rate limit', () => {
  beforeEach(() => {
    jest.mocked(getEnv).mockReturnValue({
      APP_MODE: { type: 'tenant' },
      HUMAN_CHECK_RATE_LIMIT: 60
    } as unknown as ReturnType<typeof getEnv>);
    jest.mocked(guardSubmit).mockResolvedValue({ ok: true });
  });

  it('uses the environment limit by default', async () => {
    await refuseUnlessHuman(request(), 'tour-signup', undefined);

    expect(guardSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ rateLimit: { limit: 60 } })
    );
  });

  it('lets a scope override the environment limit', async () => {
    await refuseUnlessHuman(request(), 'signup', undefined, { limit: 5 });

    expect(guardSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ rateLimit: { limit: 5 }, scope: 'signup' })
    );
  });
});
