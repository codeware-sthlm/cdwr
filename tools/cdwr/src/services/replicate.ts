import { sleep } from './shell';

const REPLICATE = 'https://api.replicate.com/v1';

export interface Shot {
  prompt: string;
  aspectRatio: '16:9' | '3:2' | '4:3' | '1:1';
}

export interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string[] | string;
  error?: string;
}

/** Where to POST a model, and the version to pin when the reference carries one */
export function predictionEndpoint(model: string): {
  url: string;
  version?: string;
} {
  const [owner, rest] = model.split('/');
  const [name, version] = (rest ?? '').split(':');
  return version
    ? { url: `${REPLICATE}/predictions`, version }
    : { url: `${REPLICATE}/models/${owner}/${name}/predictions` };
}

/** The request body Replicate expects for one shot */
export function predictionBody(
  shot: Shot,
  style: string,
  version?: string
): Record<string, unknown> {
  return {
    ...(version ? { version } : {}),
    input: {
      prompt: `${style} ${shot.prompt}`,
      aspect_ratio: shot.aspectRatio,
      output_format: 'jpg'
    }
  };
}

const headersFor = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  // Hold the request open briefly, so a fast model often answers with no polling
  Prefer: 'wait=60'
});

/** Start a prediction; may already be terminal if it finished within the wait */
export async function createPrediction(
  token: string,
  model: string,
  shot: Shot,
  style: string
): Promise<Prediction> {
  const { url, version } = predictionEndpoint(model);
  const response = await fetch(url, {
    method: 'POST',
    headers: headersFor(token),
    body: JSON.stringify(predictionBody(shot, style, version))
  });
  if (!response.ok) {
    throw new Error(
      `Replicate refused the request: ${response.status} ${await response.text()}`
    );
  }
  return (await response.json()) as Prediction;
}

async function fetchPrediction(token: string, id: string): Promise<Prediction> {
  const response = await fetch(`${REPLICATE}/predictions/${id}`, {
    headers: headersFor(token)
  });
  return (await response.json()) as Prediction;
}

/** Poll a prediction until it leaves starting/processing */
export async function pollPrediction(
  token: string,
  id: string,
  first?: Prediction
): Promise<Prediction> {
  let prediction = first ?? (await fetchPrediction(token, id));
  while (
    prediction.status === 'starting' ||
    prediction.status === 'processing'
  ) {
    await sleep(2_000);
    prediction = await fetchPrediction(token, id);
  }
  return prediction;
}

/** Download a succeeded prediction's image; Replicate's output URL is unauthenticated */
export async function downloadOutput(
  prediction: Prediction
): Promise<Uint8Array> {
  const url = Array.isArray(prediction.output)
    ? prediction.output[0]
    : prediction.output;
  if (!url) throw new Error('Prediction succeeded but returned no image');
  const image = await fetch(url);
  if (!image.ok) {
    throw new Error(`Could not download the image: ${image.status}`);
  }
  return new Uint8Array(await image.arrayBuffer());
}
