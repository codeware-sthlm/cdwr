import {
  createPrediction,
  downloadOutput,
  pollPrediction,
  predictionBody,
  predictionEndpoint
} from './replicate';

vi.mock('./shell', () => ({ sleep: vi.fn().mockResolvedValue(undefined) }));

describe('predictionEndpoint', () => {
  it('targets the model endpoint for a latest reference', () => {
    expect(predictionEndpoint('black-forest-labs/flux-schnell')).toEqual({
      url: 'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions'
    });
  });

  it('targets the shared endpoint and returns the version for a pinned reference', () => {
    expect(predictionEndpoint('owner/name:abc123')).toEqual({
      url: 'https://api.replicate.com/v1/predictions',
      version: 'abc123'
    });
  });
});

describe('predictionBody', () => {
  const shot = { prompt: 'a bundle of fibre', aspectRatio: '16:9' as const };

  it('prefixes the style and carries the shot through', () => {
    expect(predictionBody(shot, 'Dark background.')).toEqual({
      input: {
        prompt: 'Dark background. a bundle of fibre',
        aspect_ratio: '16:9',
        output_format: 'jpg'
      }
    });
  });

  it('pins the version when one is given', () => {
    expect(predictionBody(shot, 'Dark background.', 'abc123')).toEqual({
      version: 'abc123',
      input: {
        prompt: 'Dark background. a bundle of fibre',
        aspect_ratio: '16:9',
        output_format: 'jpg'
      }
    });
  });
});

describe('createPrediction', () => {
  const shot = { prompt: 'hero', aspectRatio: '16:9' as const };

  it('posts to the model endpoint and returns the prediction', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'p1', status: 'starting' })
    });
    vi.stubGlobal('fetch', fetchMock);

    const prediction = await createPrediction(
      'token',
      'owner/model',
      shot,
      'style'
    );

    expect(prediction).toEqual({ id: 'p1', status: 'starting' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.replicate.com/v1/models/owner/model/predictions',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws with the response body when Replicate refuses the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve('bad input')
      })
    );

    await expect(
      createPrediction('token', 'owner/model', shot, 'style')
    ).rejects.toThrow('422');
  });
});

describe('pollPrediction', () => {
  it('polls until the prediction leaves starting/processing', async () => {
    const responses = [
      { id: 'p1', status: 'processing' },
      { id: 'p1', status: 'succeeded', output: ['https://img'] }
    ];
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(responses.shift())
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const prediction = await pollPrediction('token', 'p1', {
      id: 'p1',
      status: 'starting'
    });

    expect(prediction.status).toBe('succeeded');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws with the response body instead of returning a malformed prediction', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('rate limited')
      })
    );

    await expect(
      pollPrediction('token', 'p1', { id: 'p1', status: 'starting' })
    ).rejects.toThrow('429');
  });
});

describe('downloadOutput', () => {
  it('downloads the first output url', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(bytes.buffer)
      })
    );
    const result = await downloadOutput({
      id: 'p1',
      status: 'succeeded',
      output: ['https://img']
    });
    expect(result).toEqual(bytes);
  });

  it('throws when a succeeded prediction has no output', async () => {
    await expect(
      downloadOutput({ id: 'p1', status: 'succeeded' })
    ).rejects.toThrow('no image');
  });
});
