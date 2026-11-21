import { keyHeaders } from './supabase-rest';

describe('keyHeaders', () => {
  it('sends a legacy JWT key as apikey and Bearer', () => {
    expect(keyHeaders('eyJhbGciOi.payload.sig')).toEqual({
      apikey: 'eyJhbGciOi.payload.sig',
      Authorization: 'Bearer eyJhbGciOi.payload.sig'
    });
  });

  it.each(['sb_secret_x', 'sb_publishable_x'])(
    'sends %s as apikey alone',
    (key) => {
      expect(keyHeaders(key)).toEqual({ apikey: key });
    }
  );
});
